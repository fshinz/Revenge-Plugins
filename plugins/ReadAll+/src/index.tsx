import { after } from "@vendetta/patcher";
import { React } from "@vendetta/metro/common";
import { View } from "react-native";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import ReadButton from "./ReadButton";
import { 
  addServerException, 
  removeServerException, 
  addDMException, 
  removeDMException, 
  clearAllExceptions, 
  getAllExceptions 
} from "./Settings";

const TAG = "[ReadAckButton]";
const TILE = 48;
const MARGIN = 4;

let unpatchers: (() => boolean)[] = [];
const patchedObjects = new WeakSet<object>();
let retryTimer: ReturnType<typeof setInterval> | undefined;

function isUseGuildsBarProps(exports: any): boolean {
  return (
    typeof exports?.default === "function" &&
    exports.default.name === "useGuildsBarProps"
  );
}

function patchFooter(ret: any) {
  const ldp = ret?.listDataProps;
  if (!ldp || patchedObjects.has(ldp)) return;
  if (typeof ldp.footerSize !== "function" || typeof ldp.renderFooter !== "function") return;

  const origFooterSize = ldp.footerSize;
  const origRenderFooter = ldp.renderFooter;
  const extra = TILE + 2 * MARGIN;

  ldp.footerSize = () => origFooterSize.call(ldp) + extra;
  ldp.renderFooter = () =>
    React.createElement(
      View,
      { style: { alignSelf: "stretch" }, collapsable: false },
      origRenderFooter.call(ldp),
      React.createElement(ReadButton)
    );

  patchedObjects.add(ldp);
}

function scanRegistry(): number {
  const modules = (globalThis as any)?.modules;
  if (!modules) return 0;

  let patchedCount = 0;
  for (const id in modules) {
    const def = modules[id];
    if (!def?.isInitialized) continue;
    const exports = def.publicModule?.exports;
    if (!exports) continue;

    if (isUseGuildsBarProps(exports)) {
      try {
        unpatchers.push(
          after("default", exports, (_args: any[], ret: any) => patchFooter(ret))
        );
        patchedCount++;
      } catch (e) {
        console.log(TAG, `Failed to patch module ${id}:`, e);
      }
    }
  }
  return patchedCount;
}

const SettingsComponent = () => {
  const [serverInput, setServerInput] = React.useState("");
  const [dmInput, setDMInput] = React.useState("");
  const [exceptions, setExceptions] = React.useState(getAllExceptions());

  const refreshExceptions = () => setExceptions(getAllExceptions());

  const handleAddServer = () => {
    if (serverInput.trim() && addServerException(serverInput.trim())) {
      showToast("Added server exception", getAssetIDByName("ic_check"));
      setServerInput("");
      refreshExceptions();
    }
  };

  const handleAddDM = () => {
    if (dmInput.trim() && addDMException(dmInput.trim())) {
      showToast("Added DM exception", getAssetIDByName("ic_check"));
      setDMInput("");
      refreshExceptions();
    }
  };

  return (
    <React.Fragment>
      <Forms.FormSection title="Server Exceptions">
        <Forms.FormInput
          placeholder="Enter server ID"
          value={serverInput}
          onChange={setServerInput}
          onSubmitEditing={handleAddServer}
        />
        <Forms.FormRow label="Add Server" onPress={handleAddServer} />
        {exceptions.servers.map((server) => (
          <Forms.FormRow
            key={server.id}
            label={server.name}
            subLabel={server.id}
            trailing={
              <Forms.FormRow
                label="Remove"
                style={{ color: "#ff4757" }}
                onPress={() => {
                  removeServerException(server.id);
                  refreshExceptions();
                }}
              />
            }
          />
        ))}
      </Forms.FormSection>

      <Forms.FormSection title="DM Exceptions">
        <Forms.FormInput
          placeholder="Enter channel ID"
          value={dmInput}
          onChange={setDMInput}
          onSubmitEditing={handleAddDM}
        />
        <Forms.FormRow label="Add DM" onPress={handleAddDM} />
        {exceptions.dms.map((dm) => (
          <Forms.FormRow
            key={dm.id}
            label={dm.name}
            subLabel={dm.id}
            trailing={
              <Forms.FormRow
                label="Remove"
                style={{ color: "#ff4757" }}
                onPress={() => {
                  removeDMException(dm.id);
                  refreshExceptions();
                }}
              />
            }
          />
        ))}
      </Forms.FormSection>

      <Forms.FormSection title="Actions">
        <Forms.FormRow
          label="Clear All Exceptions"
          onPress={() => {
            clearAllExceptions();
            refreshExceptions();
          }}
        />
      </Forms.FormSection>
    </React.Fragment>
  );
};

export default {
  onLoad() {
    const count = scanRegistry();
    if (count === 0) {
      let ticks = 0;
      retryTimer = setInterval(() => {
        ticks++;
        const n = scanRegistry();
        if (n > 0 || ticks >= 30) {
          if (retryTimer) clearInterval(retryTimer);
          retryTimer = undefined;
        }
      }, 1000);
    }
  },

  onUnload() {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = undefined;
    unpatchers.forEach((u) => u());
    unpatchers = [];
  },

  settings: SettingsComponent
};
