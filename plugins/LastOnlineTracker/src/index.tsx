import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

// UI Components
const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRadioGroup, TableRadioRow, TableSwitchRow, Stack } = findByProps(
  "TableRadioGroup",
  "TableRadioRow",
  "TableSwitchRow",
  "TableRowGroup",
  "Stack"
);
const FormText = findByProps("FormText")?.FormText || findByProps("Text")?.Text;

// --- Storage & Data ---
storage.settings ??= {
  label: "Active",
  timeFormat: "relative",
  persist: true,
  dmList: true,
};
storage.lastSeen ??= {};

const MAX_TRACKED = 500;
const lastSeen = new Map<string, number>();

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

// --- Time Formatters ---
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

// --- Presence Tracker ---
const PresenceStore = findByStoreName("PresenceStore") || findByProps("getStatus");
const FluxDispatcher = findByProps("dispatch", "subscribe");

const isOffline = (userId: string) => {
  try {
    const st = PresenceStore?.getStatus?.(userId);
    return !st || st === "offline" || st === "invisible";
  } catch {
    return false;
  }
};

const seenOnline = new Set<string>();
let unsubPresence: (() => void) | null = null;

const startPresence = () => {
  const handlePresenceUpdate = (e: any) => {
    for (const { user, status } of e?.updates ?? []) {
      if (!user?.id) continue;
      if (status === "offline" || status === "invisible" || !status) {
        if (seenOnline.has(user.id)) markSeen(user.id);
        seenOnline.delete(user.id);
      } else {
        seenOnline.add(user.id);
      }
    }
  };

  FluxDispatcher?.subscribe?.("PRESENCE_UPDATES", handlePresenceUpdate);
  unsubPresence = () => FluxDispatcher?.unsubscribe?.("PRESENCE_UPDATES", handlePresenceUpdate);
};

// --- Settings UI ---
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

        <TableRowGroup title="Surfaces">
          {FormText && (
            <FormText style={{ paddingHorizontal: 12, paddingBottom: 4, opacity: 0.6, fontSize: 12 }}>
              Inject last-seen subtext into DM list and member list rows.
            </FormText>
          )}
          <TableSwitchRow
            label="Enable subtext in user rows"
            value={!!storage.settings.dmList}
            onValueChange={(v: boolean) => (storage.settings.dmList = v)}
          />
        </TableRowGroup>
      </Stack>
    </ScrollView>
  );
}

// --- Plugin Lifecycle ---
const restoreFns: Array<() => void> = [];

export default {
  onLoad: () => {
    try {
      startPresence();

      const UserRowMod = findByProps("UserRow");
      if (UserRowMod && typeof UserRowMod.default === "function") {
        const originalUserRow = UserRowMod.default;

        UserRowMod.default = function (...args: any[]) {
          const props = args[0];
          if (props && storage.settings.dmList) {
            const userId = props?.user?.id || props?.userId || props?.id;
            if (userId) {
              const seenAt = getSeen(userId);
              if (isOffline(userId) && seenAt !== undefined) {
                props.subtext = labelFor(seenAt);
              }
            }
          }
          return originalUserRow.apply(this, args);
        };

        restoreFns.push(() => {
          UserRowMod.default = originalUserRow;
        });
      }
    } catch (err) {
      console.log("[LastOnlineTracker Load Error]:", err);
    }
  },

  onUnload: () => {
    if (unsubPresence) unsubPresence();
    restoreFns.forEach((restore) => {
      try {
        restore();
      } catch (e) {}
    });
    restoreFns.length = 0;
  },

  settings: Settings,
};
