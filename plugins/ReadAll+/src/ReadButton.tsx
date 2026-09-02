import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { isServerExcluded, isDMExcluded } from "./Settings";

const { View, Pressable, StyleSheet, Image } = RN;
const Haptic = findByProps("triggerHapticFeedback", "HapticFeedbackTypes");

const TILE = 48;
const MARGIN = 4;
const COOLDOWN_MS = 60000;
let lastUsed = 0;

const getStores = () => ({
  GuildStore: findByStoreName("GuildStore"),
  GuildChannelStore: findByStoreName("GuildChannelStore") || findByStoreName("ChannelStore"),
  ChannelStore: findByStoreName("ChannelStore"),
  ReadStateStore: findByStoreName("ReadStateStore"),
  FluxDispatcher: findByProps("dispatch", "subscribe") || findByStoreName("Dispatcher")
});

const getDMChannels = (ChannelStore: any, GuildChannelStore: any) => {
  const dmChannels: any[] = [];
  const channelStore = ChannelStore || GuildChannelStore;
  if (!channelStore) return dmChannels;

  if (channelStore.getPrivateChannels) {
    try {
      const privateChannels = channelStore.getPrivateChannels();
      if (privateChannels && typeof privateChannels === 'object') {
        Object.values(privateChannels).forEach((channel: any) => {
          if (channel && channel.id) dmChannels.push(channel);
        });
      }
    } catch {}
  }
  return dmChannels;
};

const getUnreadChannels = () => {
  const { GuildStore, GuildChannelStore, ChannelStore, ReadStateStore } = getStores();
  if (!GuildStore || !ReadStateStore) return [];

  const channels: Array<any> = [];

  const guilds = GuildStore.getGuilds();
  Object.values(guilds).forEach((guild: any) => {
    if (!guild?.id || isServerExcluded(guild.id)) return;
    try {
      let guildChannels: any[] = [];
      const channelStore = GuildChannelStore || ChannelStore;
      if (channelStore?.getChannels) {
        const channelData = channelStore.getChannels(guild.id);
        if (channelData?.SELECTABLE) guildChannels = guildChannels.concat(channelData.SELECTABLE);
        if (channelData?.VOCAL) guildChannels = guildChannels.concat(channelData.VOCAL);
      }

      guildChannels.forEach((c: any) => {
        const channel = c?.channel || c;
        if (!channel?.id) return;
        if (ReadStateStore.hasUnread?.(channel.id)) {
          channels.push({
            channelId: channel.id,
            messageId: ReadStateStore.lastMessageId?.(channel.id) || null,
            readStateType: 0
          });
        }
      });
    } catch {}
  });

  const dmChannels = getDMChannels(ChannelStore, GuildChannelStore);
  dmChannels.forEach((channel: any) => {
    if (!channel?.id || isDMExcluded(channel.id)) return;
    if (ReadStateStore.hasUnread?.(channel.id)) {
      channels.push({
        channelId: channel.id,
        messageId: ReadStateStore.lastMessageId?.(channel.id) || null,
        readStateType: 0
      });
    }
  });

  return channels;
};

export default function ReadButton() {
  const handlePress = () => {
    Haptic?.triggerHapticFeedback?.(Haptic.HapticFeedbackTypes.SOFT);

    const now = Date.now();
    const timeSinceLastUse = now - lastUsed;
    if (timeSinceLastUse < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - timeSinceLastUse) / 1000);
      showToast(`Wait ${remainingSeconds}s before reusing`, getAssetIDByName("Small"));
      return;
    }

    const { FluxDispatcher } = getStores();
    const targetChannels = getUnreadChannels();

    if (targetChannels.length === 0) {
      showToast("No unread notifications!", getAssetIDByName("Small"));
      return;
    }

    lastUsed = now;

    FluxDispatcher.dispatch({
      type: "BULK_ACK",
      context: "APP",
      channels: targetChannels
    });

    showToast(`Cleared ${targetChannels.length} notifications!`, getAssetIDByName("Check"));
  };

  return (
    <View style={st.row}>
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Mark All as Read">
        <View style={st.tile}>
          <View style={st.circleBg}>
            <Image
              source={getAssetIDByName("ic_eye")}
              style={{ width: 24, height: 24, tintColor: "#DBDEE1" }}
            />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingTop: MARGIN,
    paddingBottom: MARGIN,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 16,
    backgroundColor: "#111214",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  circleBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2B2D31",
    alignItems: "center",
    justifyContent: "center",
  }
});
