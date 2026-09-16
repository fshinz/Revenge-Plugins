import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { patcher, storage } from "@vendetta";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";

// --- Storage Setup ---
if (!storage.settings) {
  storage.settings = {
    label: "Active",
    timeFormat: "relative",
    persist: true,
    dmList: true,
    memberList: true,
    header: true,
  };
}
if (!storage.lastSeen) storage.lastSeen = {};

const MAX_TRACKED = 500;
const lastSeen = new Map<string, number>();

// Hydrate lastSeen map from storage if persistence is enabled
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

// --- UI Helpers ---
const renderText = (children: string) =>
  Text ? React.createElement(Text, { variant: "text-xs/medium", color: "text-muted" }, children) : null;

// --- Settings Component ---
const LABELS = ["Active", "Last seen", "Online", "Seen"];

function Settings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const id = setInterval(forceUpdate, 1000);
    return () => clearInterval(id);
  }, []);

  const { FormSection, FormRadioRow, FormSwitchRow, FormText } = Forms;

  return (
    <RN.ScrollView style={{ flex: 1, padding: 10 }}>
      <FormSection title="Label">
        {LABELS.map((v) => (
          <FormRadioRow
            key={v}
            label={v}
            selected={storage.settings.label === v}
            onPress={() => (storage.settings.label = v)}
          />
        ))}
      </FormSection>

      <FormSection title="Time Format">
        <FormRadioRow
          label="Relative (5m ago)"
          selected={storage.settings.timeFormat === "relative"}
          onPress={() => (storage.settings.timeFormat = "relative")}
        />
        <FormRadioRow
          label="Exact (2:34 PM)"
          selected={storage.settings.timeFormat === "exact"}
          onPress={() => (storage.settings.timeFormat = "exact")}
        />
      </FormSection>

      <FormSection title="Where to Show">
        <FormText type="description" style={{ marginBottom: 8 }}>
          Control where last-seen status indicators should render.
        </FormText>
        <FormSwitchRow
          label="DM list"
          subLabel="Shows last active timestamp inside direct message rows."
          value={storage.settings.dmList}
          onValueChange={(v: boolean) => (storage.settings.dmList = v)}
        />
        <FormSwitchRow
          label="Member list"
          subLabel="Shows in server and group member list cards."
          value={storage.settings.memberList}
          onValueChange={(v: boolean) => (storage.settings.memberList = v)}
        />
        <FormSwitchRow
          label="DM header"
          subLabel="Shows in the active channel header."
          value={storage.settings.header}
          onValueChange={(v: boolean) => (storage.settings.header = v)}
        />
      </FormSection>

      <FormSection title="Persistence">
        <FormSwitchRow
          label="Save last-seen across restarts"
          subLabel="Retains captured last-seen timestamps in local storage."
          value={storage.settings.persist}
          onValueChange={(v: boolean) => {
            storage.settings.persist = v;
            if (!v) {
              lastSeen.clear();
              storage.lastSeen = {};
            }
          }}
        />
      </FormSection>
    </RN.ScrollView>
  );
}

// --- Main Plugin Object ---
const unpatches: Array<() => void> = [];

export default {
  onLoad: () => {
    try {
      startPresence();

      // 1. Patch ActivityStatus component (for Member List & Headers)
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

      // 2. Patch DM List items (MessagesItemChannelContent)
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
