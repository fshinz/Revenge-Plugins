import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { patcher } from "@vendetta";
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
const FluxDispatcher = findByProps("dispatch", "subscribe");
const Text = findByProps("Text")?.Text || findByProps("TextStyleSheet")?.Text;

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
            subLabel="Can look inconsistent or flicker in the DM list if your message previews are set to All."
            value={!!storage.settings.dmList}
            onValueChange={(v: boolean) => (storage.settings.dmList = v)}
          />
          <TableSwitchRow
            label="Member list"
            subLabel="Server and DM member lists both"
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
            subLabel="A saved time only updates the next time that person goes offline again - can look outdated meanwhile."
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
const unpatches: Array<() => void> = [];

export default {
  onLoad: () => {
    try {
      startPresence();

      const renderText = (children: string) =>
        Text ? React.createElement(Text, { variant: "text-xs/medium", color: "text-muted" }, children) : null;

      // 1. ActivityStatus Patch
      const ActivityStatusModule = findByProps("ActivityStatus") || findByProps("renderActivityStatus");
      const ActivityTarget = ActivityStatusModule?.ActivityStatus ? ActivityStatusModule : findByProps("default");

      if (ActivityTarget) {
        unpatches.push(
          patcher.after(ActivityTarget, ActivityTarget.ActivityStatus ? "ActivityStatus" : "default", (args, res) => {
            const props = args[0];
            const enabled = storage.settings.header !== false || storage.settings.memberList !== false;
            if (!props?.userId || !enabled) return res;

            const seenAt = getSeen(props.userId);
            if (!isOffline(props.userId) || seenAt === undefined) return res;

            const label = labelFor(seenAt);
            return (
              <RN.View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                {res}
                {renderText(` · ${label}`)}
              </RN.View>
            );
          })
        );
      }

      // 2. DM List Patch
      const DMChannelContent = findByProps("MessagesItemChannelContent") || findByProps("ChannelItemRow");
      if (DMChannelContent) {
        const targetKey = DMChannelContent.MessagesItemChannelContent ? "MessagesItemChannelContent" : "default";

        unpatches.push(
          patcher.after(DMChannelContent, targetKey, (args, res) => {
            if (!storage.settings.dmList) return res;

            const props = args[0];
            const recipients = props?.channel?.recipients;
            if (recipients?.length !== 1) return res;

            const recipientId = recipients[0];
            const seenAt = getSeen(recipientId);
            if (!isOffline(recipientId) || seenAt === undefined) return res;

            const label = labelFor(seenAt);

            return (
              <RN.View style={{ flexDirection: "column" }}>
                {res}
                {renderText(label)}
              </RN.View>
            );
          })
        );
      }
    } catch (err) {
      console.log("[LastOnlineTracker Load Error]:", err);
    }
  },

  onUnload: () => {
    if (unsubPresence) unsubPresence();
    unpatches.forEach((u) => {
      try {
        u();
      } catch (e) {}
    });
    unpatches.length = 0;
  },

  settings: Settings,
};
