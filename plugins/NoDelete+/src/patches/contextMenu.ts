import { after } from "@vendetta/patcher";
import { findByProps, findByName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";

// Target standard sheet hooks across different Vendetta/Revenge versions
const ContextMenuUtils = findByProps("openLazy", "toggleLazy");

export function patchContextMenu() {
  const unpatches: (() => void)[] = [];

  // Try patching openLazy menu generation
  if (ContextMenuUtils?.openLazy) {
    unpatches.push(
      after("openLazy", ContextMenuUtils, (args, res) => {
        const [componentPromise, menuName] = args;
        if (!menuName?.includes("User") && !menuName?.includes("Profile")) return;

        componentPromise().then((mod: any) => {
          if (!mod?.default) return;
          const target = mod.default;

          const unpatchTarget = after("default", mod, (propsArgs, ret) => {
            try {
              const userId = propsArgs[0]?.user?.id || propsArgs[0]?.userId;
              if (!userId) return;

              const items = 
                ret?.props?.children?.props?.children ||
                ret?.props?.children ||
                ret?.props?.items;

              if (!Array.isArray(items)) return;

              const isIgnored = storage.ignore?.users?.includes(userId);

              items.push({
                label: isIgnored ? "Unignore User (Logger)" : "Ignore User (Logger)",
                isDestructive: !isIgnored,
                action: () => {
                  storage.ignore ??= { users: [], bots: false, ownMessages: false };
                  if (isIgnored) {
                    storage.ignore.users = storage.ignore.users.filter((id: string) => id !== userId);
                    showToast(`Unignored user`);
                  } else {
                    storage.ignore.users.push(userId);
                    showToast(`Ignoring user messages`);
                  }
                },
              });
            } catch (e) {
              console.error("[MessageLogger] Context menu injection error:", e);
            }
          });
          unpatches.push(unpatchTarget);
        });
      })
    );
  }

  // Fallback direct patch for named sheet modules
  const ActionSheetModules = ["UserProfileActionSheet", "UserContextMenu"];
  for (const name of ActionSheetModules) {
    const mod = findByName(name, false) || findByProps(name);
    if (mod) {
      unpatches.push(
        after(name in mod ? name : "default", mod, (args, ret) => {
          const userId = args[0]?.user?.id || args[0]?.userId;
          if (!userId) return;

          const isIgnored = storage.ignore?.users?.includes(userId);
          const children = ret?.props?.children?.props?.children || ret?.props?.children;

          if (Array.isArray(children)) {
            children.push({
              label: isIgnored ? "Unignore User (Logger)" : "Ignore User (Logger)",
              action: () => {
                storage.ignore ??= { users: [], bots: false, ownMessages: false };
                if (isIgnored) {
                  storage.ignore.users = storage.ignore.users.filter((id: string) => id !== userId);
                  showToast(`Unignored user`);
                } else {
                  storage.ignore.users.push(userId);
                  showToast(`Ignoring user messages`);
                }
              },
            });
          }
        })
      );
    }
  }

  return () => {
    for (const fn of unpatches) fn();
  };
}
