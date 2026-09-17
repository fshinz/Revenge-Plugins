import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

// UI Components via findByProps
const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRadioGroup, TableRadioRow, TableSwitchRow, Stack } = findByProps(
  "TableRadioGroup",
  "TableRadioRow",
  "TableSwitchRow",
  "TableRowGroup",
  "Stack"
);
const FormText = findByProps("FormText")?.FormText || findByProps("Text")?.Text;

// --- Storage Setup ---
storage.settings ??= {
  label: "Active",
  timeFormat: "relative",
  persist: true,
  dmList: true,
  memberList: true,
  header: true,
};
storage.lastSeen ??= {};

const MAX_TRACKED = 500;
const lastSeen = new Map<string, number>();

// Hydration
if (storage.settings.persist && storage.lastSeen) {
  for (const [id, ts] of Object.entries(storage.lastSeen)) {
    if (typeof ts === "number" && ts > 0) lastSeen.set(id, ts);
  }
}

const schedulePersist = () => {
  if (storage.settings.persist) {
    storage.lastSeen = Object.fromEntries(lastSeen);
  }
};

const markSeen = (userId: string) => {
  lastSeen.delete(userId);
  lastSeen.set(userId, Date.now());
  if (lastSeen.size > MAX_TRACKED) {
    const firstKey = lastSeen.keys().next().value;
    if (firstKey) lastSeen.delete(firstKey);
  }
  schedulePersist();
};

const getSeen = (userId: string) => lastSeen.get(userId);

// --- Time Helpers ---
const formatRelative = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s | 0}s ago`;
  const m = s / 60;
  if (m < 60) return `${m | 0}m ago`;
  const h = m / 60;
  if (h < 24) return `${h | 0}h ago`;
  const d = h / 24;
  return d < 7 ? `${d | 0}d ago` : `${(d / 7) | 0}w ago`;
};

const formatTime = (ts: number) =>
  storage.settings.timeFormat === "exact"
    ? new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : formatRelative(Date.now() - ts);

const labelFor = (ts: number) => `${storage.settings.label || "Active"} ${formatTime(ts)}`;

// --- Stores & Metro Finders ---
const PresenceStore = findByStoreName("PresenceStore") || findByProps("getStatus");
const UserStore = findByStoreName("UserStore");
const FluxDispatcher = findByProps("dispatch", "subscribe");

const isOffline = (userId: string) => {
  try {
    return (PresenceStore?.getStatus?.(userId) ?? "offline") === "offline";
  } catch {
    return false;
  }
};

// --- Presence Listener ---
const seenOnline = new Set<string>();
let unsubPresence: (() => void) | null = null;

const startPresence = () => {
  const handlePresenceUpdate = (e: any) => {
    for (const { user, status } of e?.updates ?? []) {
      if (!user?.id) continue;
      if (status === "offline") {
        if (seenOnline.has(user.id)) markSeen(user.id);
        seenOnline.delete(user.id);
      } else if (status) {
        seenOnline.add(user.id);
      }
    }
  };

  FluxDispatcher?.subscribe?.("PRESENCE_UPDATES", handlePresenceUpdate);
  unsubPresence = () => FluxDispatcher?.unsubscribe?.("PRESENCE_UPDATES", handlePresenceUpdate);
};

// --- Proxy Implementation for UserStore ---
let origGetUser: any = null;
const proxyCache = new WeakMap<object, any>();

function patchUserStore() {
  if (!UserStore?.getUser || origGetUser) return;

  origGetUser = UserStore.getUser;
  const currentUserId = UserStore.getCurrentUser()?.id;

  UserStore.getUser = function (id: string) {
    const user = origGetUser.call(this, id);
    if (!user || id === currentUserId) return user;

    // Check settings toggles
    const anyEnabled =
      storage.settings.dmList !== false ||
      storage.settings.memberList !== false ||
      storage.settings.header !== false;

    if (!anyEnabled) return user;

    const seenAt = getSeen(id);
    if (!isOffline(id) || seenAt === undefined) return user;

    // Return cached proxy if present
    if (proxyCache.has(user)) {
      return proxyCache.get(user);
    }

    const label = labelFor(seenAt);

    const proxiedUser = new Proxy(user, {
      get(target, prop, receiver) {
        if (prop === "globalName" || prop === "username") {
          const originalName = target[prop];
          if (!originalName) return originalName;
          return `${originalName} • ${label}`;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    proxyCache.set(user, proxiedUser);
    return proxiedUser;
  };
}

function unpatchUserStore() {
  if (UserStore && origGetUser) {
    UserStore.getUser = origGetUser;
    origGetUser = null;
  }
}

// --- Settings Component ---
const LABELS = ["Active", "Last seen", "Online", "Seen"];

function Settings() {
  useProxy(storage);
  const selectedLabel = storage.settings.label || "Active";
  const selectedFormat = storage.settings.timeFormat || "relative";

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
      <Stack spacing={16}>
        {/* Label Radio Options */}
        <TableRadioGroup
          title="Label"
          value={selectedLabel}
          onChange={(val: string) => (storage.settings.label = val)}
        >
          {LABELS.map((v) => (
            <TableRadioRow
              key={v}
              label={v}
              value={v}
              selected={selectedLabel === v}
              onPress={() => (storage.settings.label = v)}
            />
          ))}
        </TableRadioGroup>

        {/* Time Format Radio Options */}
        <TableRadioGroup
          title="Time format"
          value={selectedFormat}
          onChange={(val: string) => (storage.settings.timeFormat = val)}
        >
          <TableRadioRow
            label="Relative (5m ago)"
            value="relative"
            selected={selectedFormat === "relative"}
            onPress={() => (storage.settings.timeFormat = "relative")}
          />
          <TableRadioRow
            label="Exact (2:34 PM)"
            value="exact"
            selected={selectedFormat === "exact"}
            onPress={() => (storage.settings.timeFormat = "exact")}
          />
        </TableRadioGroup>

        {/* Display Switches */}
        <TableRowGroup title="Where to show it">
          {FormText && (
            <FormText style={{ paddingHorizontal: 12, paddingBottom: 4, opacity: 0.6, fontSize: 12 }}>
              Control where last-seen status indicators render across mobile UI surfaces.
            </FormText>
          )}
          <TableSwitchRow
            label="DM list"
            value={!!storage.settings.dmList}
            onValueChange={(v: boolean) => (storage.settings.dmList = v)}
          />
          <TableSwitchRow
            label="Member list"
            value={!!storage.settings.memberList}
            onValueChange={(v: boolean) => (storage.settings.memberList = v)}
          />
          <TableSwitchRow
            label="DM header"
            value={!!storage.settings.header}
            onValueChange={(v: boolean) => (storage.settings.header = v)}
          />
        </TableRowGroup>

        {/* Persistence Options */}
        <TableRowGroup title="Persistence">
          <TableSwitchRow
            label="Save last-seen across restarts"
            subLabel="A saved time only updates the next time that person goes offline again."
            value={!!storage.settings.persist}
            onValueChange={(v: boolean) => {
              storage.settings.persist = v;
              if (!v) {
                lastSeen.clear();
                storage.lastSeen = {};
              }
            }}
          />
        </TableRowGroup>
      </Stack>
    </ScrollView>
  );
}

// --- Plugin Implementation ---
export default {
  onLoad: () => {
    try {
      startPresence();
      patchUserStore();
    } catch (err) {
      console.log("[LastOnlineTracker Load Error]:", err);
    }
  },

  onUnload: () => {
    if (unsubPresence) unsubPresence();
    unpatchUserStore();
  },

  settings: Settings,
};
