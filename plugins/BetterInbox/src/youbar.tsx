import { findByProps, findByName, findByTypeName } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { getAssetIDByName } from "@vendetta/ui/assets";
import NotificationCenterUI from "./components/NotificationCenterUI";

let updateYouBar: () => void = () => {};

export function notifyYouBarUpdate() {
  updateYouBar();
}

const openInbox = () => {
  // Navigation isn't ready when the plugin loads, so resolve it on press.
  const Navigation = findByProps("push", "pushLazy", "pop");
  const Navigator = findByName("Navigator") ?? findByProps("Navigator")?.Navigator;
  const modalCloseButton =
    findByProps("getRenderCloseButton")?.getRenderCloseButton ??
    findByProps("getHeaderCloseButton")?.getHeaderCloseButton;

  if (!Navigator || !Navigation?.push) return;

  console.log("[BetterInbox] openInbox", { Navigation: !!Navigation, Navigator: !!Navigator });

  Navigation.push(() => (
    <Navigator
      initialRouteName="YouBarInbox"
      goBackOnBackPress
      screens={{
        YouBarInbox: {
          title: "Inbox",
          headerLeft: modalCloseButton?.(() => Navigation.pop()),
          render: () => <NotificationCenterUI />,
        },
      }}
    />
  ));
};

// The bell navigates to "notifications" through a stable root navigation ref,
// so redirecting that route opens BetterInbox - no button re-render needed.
export function patchInboxNavigation(): (() => void) | null {
  const getRootNavigationRef = findByProps("getRootNavigationRef")?.getRootNavigationRef;
  const ref = getRootNavigationRef?.();
  if (!ref?.navigate) return null;

  const origNavigate = ref.navigate;
  ref.navigate = (name: string, ...rest: any[]) => {
    if (name === "notifications") {
      openInbox();
      return;
    }
    origNavigate(name, ...rest);
  };

  return () => {
    ref.navigate = origNavigate;
  };
}

export default function patchYouBarButtons(): (() => void) | null {
  const YouBarNotificationsButton = findByTypeName("YouBarNotificationsButton");
  if (!YouBarNotificationsButton) return null;

  const BellIcon = getAssetIDByName("BellIcon") || getAssetIDByName("NotificationBellIcon");
  const SettingsIcon = getAssetIDByName("SettingsIcon");
  const ChatIcon = getAssetIDByName("ChatIcon");

  const unpatchType = instead("type", YouBarNotificationsButton, (args, OriginalRender) => {
    const [, forceUpdate] = React.useReducer((x: number) => ~x, 0);
    updateYouBar = () => forceUpdate();

    const res = OriginalRender(...args);
    if (!res?.props?.children) return res;

    const IconButton = res.props.children.type;
    const originalProps = res.props.children.props;

    return (
      <React.Fragment>
        {storage.showDMButton && (
          <IconButton
            variant={originalProps?.variant || "tertiary"}
            size={originalProps?.size || "sm"}
            icon={ChatIcon}
            onPress={() => findByProps("transitionToGuild")?.transitionToGuild?.("@me")}
          />
        )}

        {storage.showSettingsButton && (
          <IconButton
            variant={originalProps?.variant || "tertiary"}
            size={originalProps?.size || "sm"}
            icon={SettingsIcon}
            onPress={() => findByProps("openUserSettings")?.openUserSettings?.()}
          />
        )}

        <IconButton
          variant={originalProps?.variant || "tertiary"}
          size={originalProps?.size || "sm"}
          icon={BellIcon || originalProps?.icon}
          onPress={openInbox}
        />
      </React.Fragment>
    );
  });

  // React.memo skips re-renders, but the patched render only takes effect
  // after one - so keep comparing and force it through.
  const originalCompare = YouBarNotificationsButton.compare;
  YouBarNotificationsButton.compare = () => false;

  return () => {
    unpatchType();
    YouBarNotificationsButton.compare = originalCompare;
    updateYouBar = () => {};
  };
}