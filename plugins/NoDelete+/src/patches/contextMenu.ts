import { after } from "@vendetta/patcher";
import { findByName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { findInReactTree } from "@vendetta/utils";
import { showToast } from "@vendetta/ui/toasts";

const PROFILE_MENU_NAMES = [
  "UserProfileOverflowMenu",
  "BotUserProfileOverflowMenu",
];

function getMainItems(ret: any): any[] | null {
  let items = ret?.props?.items;
  if (Array.isArray(items) && Array.isArray(items[0])) return items[0];
  items = ret?.props?.children?.props?.items;
  if (Array.isArray(items) && Array.isArray(items[0])) return items[0];
  const node = findInReactTree(
    ret,
    (n: any) => Array.isArray(n?.props?.items) && Array.isArray(n.props.items[0])
  );
  return node?.props.items[0] ?? null;
}

export function patchContextMenu() {
  const unpatches: (() => void)[] = [];

  for (const name of PROFILE_MENU_NAMES) {
    const mod = findByName(name, false);
    if (!mod) continue;

    unpatches.push(
      after("default", mod, (args: any[], ret: any) => {
        try {
          const props = args[0] ?? {};
          const userId = props.user?.id || props.userId;
          if (!userId) return;

          const items = getMainItems(ret);
          if (!items) return;

          // Prevent duplicate actions from being injected
          if (items.some((item: any) => item?.label?.includes("(Logger)"))) return;

          storage.ignore ??= { users: [], bots: false, ownMessages: false };
          const isIgnored = storage.ignore.users.includes(userId);

          items.push({
            label: isIgnored ? "Unignore User (Logger)" : "Ignore User (Logger)",
            isDestructive: !isIgnored,
            action: () => {
              storage.ignore ??= { users: [], bots: false, ownMessages: false };
              if (isIgnored) {
                storage.ignore.users = storage.ignore.users.filter(
                  (id: string) => id !== userId
                );
                showToast("Unignored user messages");
              } else {
                storage.ignore.users.push(userId);
                showToast("Ignoring user messages");
              }
            },
          });
        } catch (e) {
          console.error("[MessageLogger] Context menu injection error:", e);
        }
      })
    );
  }

  return () => {
    for (const fn of unpatches) fn();
  };
}