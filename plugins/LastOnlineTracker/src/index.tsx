import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { patcher } from "@vendetta";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

// --- Metro Component & Store Finders ---
const { ScrollView, View } = RN;
const { TableRowGroup, TableRadioGroup, TableRadioRow, TableSwitchRow } = findByProps(
  "TableRadioGroup",
  "TableRadioRow",
  "TableSwitchRow",
  "TableRowGroup"
);
const Text = findByProps("Text")?.Text || findByProps("TextStyleSheet")?.Text;
const Page = findByProps("Page")?.Page || View;

const PresenceStore = findByStoreName("PresenceStore") || findByProps("getStatus");
const FluxDispatcher = findByProps("dispatch", "subscribe");

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

// Hydrate stored cache
if (storage.settings.persist && storage.lastSeen) {
  for (const [id, ts] of Object.entries(storage.lastSeen)) {
    if (typeof ts === "number" && ts > 0) lastSeen.set(id, ts as number);
  }
}

let persistTimer: any = null;
const schedulePersist = () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (storage.settings.persist) {
      storage.lastSeen = Object.fromEntries(lastSeen);
    }
  }, 1500);
};

const flushPersist = () => {
  if (!persistTimer) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  if (storage.settings.persist) {
    storage.lastSeen = Object.fromEntries(lastSeen);
  }
};

const clearPersisted = () => {
  lastSeen.clear();
  storage.lastSeen = {};
};

const markSeen = (userId: string) => {
  lastSeen.delete(userId);
  lastSeen.set(userId, Date.now());
  if (lastSeen.size > MAX_TRACKED) {
    const firstKey = lastSeen.keys().next().value;
    if (firstKey) lastSeen.delete(firstKey);
  }
  if (storage.settings.persist) schedulePersist();
};

const getSeen = (userId: string) => lastSeen.get(userId);

const isOffline = (userId: string) => {
  try {
    return (PresenceStore?.getStatus?.(userId) ?? "online") === "offline";
  } catch {
    return false;
  }
};

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

const labelFor = (ts: number) => `${storage.settings.label ?? "Active"} ${formatTime(ts)}`;

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
const hasVisibleText = (node: any): boolean => {
  if (node == null || node === "") return false;
  if (typeof node === "string") return node.trim().length > 0;
  if (Array.isArray(node)) return node.length > 0 && node.some(hasVisibleText);
  if (node && typeof node === "object")
    return "children" in (node.props || {}) ? hasVisibleText(node.props.children) : true;
  return false;
};

const renderText = (children: string) =>
  Text ? <Text variant="text-xs/medium" color="text-muted">{children}</Text> : null;

const combine = (native: any, label: string) =>
  hasVisibleText(native) ? (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
      {native}
      {renderText(` · ${label}`)}
    </View>
  ) : (
    renderText(label)
  );

// Tree traversal helper to locate nodes in react element trees
const findInTree = (tree: any, filter: (node: any) => boolean, maxDepth = 100): any => {
  if (maxDepth <= 0 || !tree) return null;
  if (filter(tree)) return tree;

  if (Array.isArray(tree)) {
    for (const item of tree) {
      const found = findInTree(item, filter, maxDepth - 1);
      if (found) return found;
    }
  } else if (typeof tree === "object") {
    const props = tree.props;
    if (props) {
      if (props.children) {
        const found = findInTree(props.children, filter, maxDepth - 1);
        if (found) return found;
      }
      for (const key of Object.keys(props)) {
        if (key === "children") continue;
        const found = findInTree(props[key], filter, maxDepth - 1);
        if (found) return found;
      }
    }
  }
  return null;
};

const matchesName = (node: any, name: string) =>
  node?.type?.name === name || node?.type?.type?.name === name || node?.type?.render?.name === name;

// --- Settings Component ---
const LABELS = ["Active", "Last seen", "Online", "Seen"];

function SettingsComponent() {
  useProxy(storage);

  return (
    <Page style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <TableRowGroup title="Label">
          <TableRadioGroup
            value={storage.settings.label ?? "Active"}
            onChange={(v: string) => (storage.settings.label = v)}
          >
            {LABELS.map((v) => (
              <TableRadioRow key={v} label={v} value={v} selected={storage.settings.label === v} />
            ))}
          </TableRadioGroup>
        </TableRowGroup>

        <TableRowGroup title="Time format">
          <TableRadioGroup
            value={storage.settings.timeFormat ?? "relative"}
            onChange={(v: string) => (storage.settings.timeFormat = v)}
          >
            <TableRadioRow label="Relative (5m ago)" value="relative" selected={storage.settings.timeFormat === "relative"} />
            <TableRadioRow label="Exact (2:34 PM)" value="exact" selected={storage.settings.timeFormat === "exact"} />
          </TableRadioGroup>
        </TableRowGroup>

        <TableRowGroup title="Where to show it">
          {renderText("These act as one on/off switch right now (any one enabled shows it everywhere).")}
          <TableSwitchRow
            label="DM list"
            subLabel="Can look inconsistent or flicker in the DM list if your message previews is set to All."
            value={storage.settings.dmList ?? true}
            onValueChange={(v: boolean) => (storage.settings.dmList = v)}
          />
          <TableSwitchRow
            label="Member list"
            subLabel="Server and DM member lists both"
            value={storage.settings.memberList ?? true}
            onValueChange={(v: boolean) => (storage.settings.memberList = v)}
          />
          <TableSwitchRow
            label="DM header"
            value={storage.settings.header ?? true}
            onValueChange={(v: boolean) => (storage.settings.header = v)}
          />
        </TableRowGroup>

        <TableRowGroup title="Persistence">
          <TableSwitchRow
            label="Save last-seen across restarts"
            subLabel="A saved time only updates the next time that person goes offline again."
            value={storage.settings.persist ?? true}
            onValueChange={(v: boolean) => {
              storage.settings.persist = v;
              if (!v) clearPersisted();
            }}
          />
        </TableRowGroup>
      </ScrollView>
    </Page>
  );
}

// --- Plugin Implementation ---
const unpatches: Array<() => void> = [];
let activityStatusOrig: any = null;

export default {
  onLoad: () => {
    try {
      startPresence();

      // 1. MessagesItemChannelContent Patch
      const ChannelContentModule = findByProps("MessagesItemChannelContent") || findByProps("ChannelItemRow");
      if (ChannelContentModule) {
        const targetKey = ChannelContentModule.MessagesItemChannelContent ? "MessagesItemChannelContent" : "default";

        unpatches.push(
          patcher.instead(ChannelContentModule, targetKey, (args, orig) => {
            const props = args[0];
            const rendered = orig(...args);
            if (storage.settings.dmList !== true) return rendered;

            const recipients = props?.channel?.recipients;
            if (recipients?.length !== 1) return rendered;

            const seenAt = getSeen(recipients[0]);
            if (!isOffline(recipients[0]) || seenAt === undefined) return rendered;
            const label = labelFor(seenAt);

            const actNode = findInTree(rendered, (n) => matchesName(n, "ActivityStatus"));
            if (actNode && activityStatusOrig) {
              actNode.type = (p: any) => combine(activityStatusOrig(p), label);
              return rendered;
            }

            const nameNode = findInTree(rendered, (n) => n?.props?.children?.[0]?.props?.variant === "text-md/medium");
            if (nameNode) {
              const original = nameNode.props.children;
              nameNode.props.children = (
                <View style={{ flexDirection: "column" }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>{original}</View>
                  {renderText(label)}
                </View>
              );
            }
            return rendered;
          })
        );
      }

      // 2. ActivityStatus Patch
      const ActivityStatusModule = findByProps("ActivityStatus") || findByProps("renderActivityStatus");
      if (ActivityStatusModule) {
        const targetKey = ActivityStatusModule.ActivityStatus ? "ActivityStatus" : "default";

        unpatches.push(
          patcher.instead(ActivityStatusModule, targetKey, (args, orig) => {
            activityStatusOrig = orig;
            const props = args[0];
            const rendered = orig(...args);
            const enabled = storage.settings.header !== false || storage.settings.memberList !== false;

            if (!props?.userId || !enabled) return rendered;
            const seenAt = getSeen(props.userId);
            if (!isOffline(props.userId) || seenAt === undefined) return rendered;

            return combine(rendered, labelFor(seenAt));
          })
        );
      }
    } catch (err) {
      console.log("[LastOnlineTracker Load Error]:", err);
    }
  },

  onUnload: () => {
    if (unsubPresence) unsubPresence();
    flushPersist();
    unpatches.forEach((u) => {
      try {
        u();
      } catch (e) {}
    });
    unpatches.length = 0;
  },

  settings: SettingsComponent,
};
