import { storage } from "@vendetta/plugin";
import patchYouBarButtons, { patchInboxNavigation, notifyYouBarUpdate } from "./youbar";
import { setInboxTracking } from "./notifications";
import NotificationCenterUI from "./components/NotificationCenterUI";

// YouBarNotificationsButton lives in a lazy chunk and module ids change between
// versions, so instead of ids we hook __d (fires once per module registration)
// and probe findByTypeName a microtask later. No __r wrapping either.
let unpatchButtons: (() => void) | null = null;
let unpatchNav: (() => void) | null = null;
let origDefine: any = null;
let hookedDefine: any = null;
let defineCalls = 0;
let probes = 0;
let pendingProbe = false;

const debug = (...a: any[]) => console.log("[BetterInbox]", ...a);

function tryPatch(reason: string) {
  if (unpatchButtons) return;
  probes++;
  const cleanup = patchYouBarButtons();
  if (cleanup) {
    unpatchButtons = cleanup;
    debug(`patched youbar button via ${reason} (probe #${probes})`);
    notifyYouBarUpdate();
  } else {
    debug(`probe #${probes} (${reason}): button not registered yet`);
  }
}

function scheduleProbe(reason: string) {
  if (pendingProbe) return;
  pendingProbe = true;
  Promise.resolve().then(() => {
    pendingProbe = false;
    tryPatch(reason);
  });
}

export default {
  onLoad: () => {
    storage.showDMButton ??= false;
    storage.showSettingsButton ??= true;
    storage.notifications ??= [];

    setInboxTracking(true);

    // Bell presses always navigate to "notifications", so route it to BetterInbox.
    unpatchNav = patchInboxNavigation();

    const g: any = globalThis;
    debug(
      "runtime:",
      JSON.stringify({ __r: typeof g.__r, __d: typeof g.__d, hasModules: !!g.modules }),
    );

    if (!hookedDefine && typeof g.__d === "function") {
      origDefine = g.__d;
      hookedDefine = function (this: any, ...args: any[]) {
        const res = origDefine.apply(this, args);
        const id = args[1];
        defineCalls++;
        // Sample a few registrations to confirm chunks resolve the global __d here.
        if (defineCalls === 1 || defineCalls % 200 === 0) {
          debug(`__d #${defineCalls} registered module ${id}`);
        }
        scheduleProbe(`__d #${defineCalls}`);
        return res;
      };
      g.__d = hookedDefine;
    }

    // In case the button already rendered (plugin enabled mid-session).
    tryPatch("onLoad");
  },

  onUnload: () => {
    const g: any = globalThis;
    if (hookedDefine && g.__d === hookedDefine) g.__d = origDefine;
    hookedDefine = null;
    if (unpatchButtons) unpatchButtons();
    unpatchButtons = null;
    if (unpatchNav) unpatchNav();
    unpatchNav = null;
    setInboxTracking(false);
  },

  settings: NotificationCenterUI,
};