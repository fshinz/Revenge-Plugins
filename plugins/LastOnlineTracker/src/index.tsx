import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { patcher } from "@vendetta";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

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
  chatMessages: true,
  dmList: true,
  memberList: true,
  header: true,
};
storage.lastSeen ??= {};

const MAX_TRACKED = 500;
const lastSeen = new Map<string, number>();

// In-memory hydration
if (storage.settings.persist && storage.lastSeen) {
  const cached = storage.lastSeen;
  for (const id in cached) {
    const ts = cached[id];
    if (typeof ts === "number" && ts > 0) lastSeen.set(id, ts);
  }
}

// --- Debounced Storage Writer (Prevents Main Thread Lag) ---
let persistTimeout: any = null;
const schedulePersist = () => {
  if (!storage.settings.persist || persistTimeout) return;

  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    storage.lastSeen = Object.fromEntries(lastSeen);
  }, 5000);
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

// --- Stores & Finders ---
const PresenceStore = findByStoreName("PresenceStore") || findByProps("getStatus");
const UserStore = findByStoreName("UserStore");
const FluxDispatcher = findByProps("dispatch", "subscribe");
const MessageAuthorModule = findByProps("getMessageAuthor", "useNullableMessageAuthor");

const isOffline = (userId: string) => {
  try {
    return (PresenceStore?.getStatus?.(userId) ?? "offline") === "offline";
  } catch {
    return false;
  }
};

// --- Optimized Presence Listener ---
const seenOnline = new Set<string>();
let unsubPresence: (() => void) | null = null;

const startPresence = () => {
  const handlePresenceUpdate = (e: any) => {
    const updates = e?.updates;
    if (!updates || !updates.length) return;

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const userId = update?.user?.id;
      if (!userId) continue;

      const status = update.status;
      if (status === "offline") {
        if (seenOnline.has(userId)) markSeen(userId);
        seenOnline.delete(userId);
      } else if (status) {
        seenOnline.add(userId);
      }
    }
  };

  FluxDispatcher?.subscribe?.("PRESENCE_UPDATES", handlePresenceUpdate);
  unsubPresence = () => FluxDispatcher?.unsubscribe?.("PRESENCE_UPDATES", handlePresenceUpdate);
};

// --- UserStore Proxy & Message Author Patch ---
let origGetUser: any = null;
const proxyCache = new WeakMap<object, any>();
const unpatches: Array<() => void> = [];

function applyPatches() {
  // 1. UserStore Proxy Patch
  if (UserStore?.getUser && !origGetUser) {
    origGetUser = UserStore.getUser;
    const currentUserId = UserStore.getCurrentUser()?.id;

    UserStore.getUser = function (id: string) {
      const user = origGetUser.call(this, id);
      if (!user || id === currentUserId) return user;

      const anyEnabled =
        storage.settings.dmList !== false ||
        storage.settings.memberList !== false ||
        storage.settings.header !== false ||
        storage.settings.chatMessages !== false;

      if (!anyEnabled) return user;

      const seenAt = getSeen(id);
      if (seenAt === undefined || !isOffline(id)) return user;

      if (proxyCache.has(user)) {
        return proxyCache.get(user);
      }

      const proxiedUser = new Proxy(user, {
        get(target, prop, receiver) {
          if (prop === "globalName" || prop === "username") {
            const originalName = target[prop];
            if (!originalName) return originalName;
            return `${originalName} • ${labelFor(seenAt)}`;
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      proxyCache.set(user, proxiedUser);
      return proxiedUser;
    };
  }

  // 2. Chat Message Author Patch (Module 4793)
  if (MessageAuthorModule?.getMessageAuthor) {
    unpatches.push(
      patcher.after(MessageAuthorModule, "getMessageAuthor", (_args, author) => {
        if (!author) return author;

        // If chat message display is DISABLED, strip appended time string
        if (storage.settings.chatMessages === false) {
          if (typeof author.nick === "string" && author.nick.includes(" • ")) {
            author.nick = author.nick.split(" • ")[0];
          }
          if (typeof author.username === "string" && author.username.includes(" • ")) {
            author.username = author.username.split(" • ")[0];
          }
        }
        return author;
      })
    );
  }
}

function removePatches() {
  if (UserStore && origGetUser) {
    UserStore.getUser = origGetUser;
    origGetUser = null;
  }
  unpatches.forEach((u) => {
    try {
      u();
    } catch (e) {}
  });
  unpatches.length = 0;
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

        <TableRowGroup title="Where to show it">
          {FormText && (
            <FormText style={{ paddingHorizontal: 12, paddingBottom: 4, opacity: 0.6, fontSize: 12 }}>
              Control where last-seen status indicators render across mobile UI surfaces.
            </FormText>
          )}
          <TableSwitchRow
            label="In channel messages"
            subLabel="Show last-seen time in chat message headers"
            value={!!storage.settings.chatMessages}
            onValueChange={(v: boolean) => (storage.settings.chatMessages = v)}
          />
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
      applyPatches();
    } catch (err) {
      console.log("[LastOnlineTracker Load Error]:", err);
    }
  },

  onUnload: () => {
    if (unsubPresence) unsubPresence();
    if (persistTimeout) clearTimeout(persistTimeout);
    removePatches();
  },

  settings: Settings,
};
