import { React, ReactNative, NavigationNative, FluxDispatcher } from "@vendetta/metro/common";
import { findByProps, findByDisplayName } from "@vendetta/metro";
import { resolveSemanticColor } from "@vendetta/ui/colors";
import { getNotifications, subscribeToNotifications, clearNotifications } from "../notifications";
import type { MentionSubCategory, NotificationCategory, NotificationItem } from "../types";

const { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, FlatList } = ReactNative;
const { useState, useMemo, useCallback, useEffect, useReducer, memo } = React;

const Router = findByProps("transitionToGuild", "transitionTo");
const NativeTabs = findByDisplayName("Tabs");
const useTabsState = findByProps("useTabsState")?.useTabsState;
const NativeSegmentedControl = findByDisplayName("SegmentedControl");

// Dynamic Theme & Color Lookup
const ColorModule = findByProps("semanticColors", "rawColors") || findByProps("ThemeColorMap");
const semanticColors = ColorModule?.semanticColors ?? {};

const getColor = (semanticKey: string, fallback: string) => {
  try {
    if (semanticColors[semanticKey]) {
      return resolveSemanticColor(semanticColors[semanticKey]) || fallback;
    }
  } catch {}
  return fallback;
};

// Profile action module
const UserProfileActions =
  findByProps("openUserProfileModal") ||
  findByProps("showUserProfile") ||
  findByProps("openUserProfile");

function categoryLabel(cat: NotificationCategory): string {
  if (cat === "friend_request") return "Friends";
  if (cat === "thread") return "Threads";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function getAvatarUrl(author: any): string {
  if (!author) return "https://cdn.discordapp.com/embed/avatars/0.png";
  const { id, avatar, discriminator } = author;

  if (avatar) {
    const ext = typeof avatar === "string" && avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=128`;
  }

  try {
    const defaultIndex =
      discriminator && discriminator !== "0"
        ? parseInt(discriminator, 10) % 5
        : Number((BigInt(id || "0") >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

// Visual Card Component
const NotificationCard = memo(({ item, onPress }: { item: NotificationItem; onPress: () => void }) => {
  const location = item.guildName
    ? `${item.guildName} • ${item.channelName}`
    : item.channelName;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Image source={{ uri: getAvatarUrl(item.author) }} style={styles.avatarImage} />
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        <Text style={styles.timestamp}>{item.timestamp}</Text>
      </View>

      <View style={styles.cardBody}>
        {Boolean(item.content) && (
          <Text style={styles.cardContent} numberOfLines={2}>
            {item.content}
          </Text>
        )}
        {Boolean(location) && (
          <Text style={styles.location} numberOfLines={1}>
            {location}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

export default function NotificationCenterUI(): JSX.Element {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [mentionFilterIdx, setMentionFilterIdx] = useState(0);

  const categories: NotificationCategory[] = [
    "mentions",
    "replies",
    "reactions",
    "friend_request",
    "thread",
    "other",
  ];
  const subFilters: Array<"all" | MentionSubCategory> = ["all", "people", "role", "bot"];

  const currentCategory = categories[activeTabIdx] ?? "mentions";
  const currentMentionFilter = subFilters[mentionFilterIdx] ?? "all";

  const tabsState = useTabsState
    ? useTabsState({
        items: categories.map((cat) => ({ id: cat, label: categoryLabel(cat) })),
        initialIndex: 0,
      })
    : null;

  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeToNotifications(() => forceUpdate()), []);

  const notifications = getNotifications();

  const displayedNotifications = useMemo(() => {
    const filtered = notifications.filter((n) => {
      if (currentCategory === "mentions") {
        if (n.category !== "mentions") return false;
        if (currentMentionFilter === "all") return true;
        return n.subCategory === currentMentionFilter;
      }
      return n.category === currentCategory;
    });

    if (currentCategory === "mentions" && currentMentionFilter === "bot") {
      return filtered.slice(0, 30);
    }

    return filtered;
  }, [notifications, currentCategory, currentMentionFilter]);

  const handleNotificationPress = useCallback((item: NotificationItem) => {
    if ((item.category === "friend_request" || (!item.channelId && !item.guildId)) && item.author?.id) {
      if (UserProfileActions?.openUserProfileModal) {
        UserProfileActions.openUserProfileModal({ userId: item.author.id });
      } else if (UserProfileActions?.showUserProfile) {
        UserProfileActions.showUserProfile({ userId: item.author.id });
      } else if (UserProfileActions?.openUserProfile) {
        UserProfileActions.openUserProfile({ userId: item.author.id });
      } else {
        FluxDispatcher.dispatch({
          type: "USER_PROFILE_MODAL_OPEN",
          userId: item.author.id,
        });
      }
      return;
    }

    if (item.channelId || item.guildId) {
      try {
        if (Router?.transitionToGuild) {
          Router.transitionToGuild(item.guildId || "@me", item.channelId, item.messageId);
        } else if (NavigationNative?.navigate) {
          NavigationNative.navigate("Channel", {
            guildId: item.guildId,
            channelId: item.channelId,
            messageId: item.messageId,
          });
        }
      } catch (err) {
        console.error("[BetterInbox] Navigation error:", err);
      }
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Notification Center</Text>
        {displayedNotifications.length > 0 && (
          <TouchableOpacity onPress={() => clearNotifications(currentCategory)}>
            <Text style={styles.clearButtonText}>
              Clear {categoryLabel(currentCategory)}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category Navigation Pills / Tabs */}
      <View style={styles.pillsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
          {categories.map((cat, idx) => {
            const active = activeTabIdx === idx;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.pill, active && styles.activePill]}
                onPress={() => setActiveTabIdx(idx)}
              >
                <Text style={[styles.pillText, active && styles.activePillText]}>
                  {categoryLabel(cat)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Mention Sub-filters */}
      {currentCategory === "mentions" && (
        <View style={styles.subFilterWrapper}>
          {NativeSegmentedControl ? (
            <NativeSegmentedControl
              value={currentMentionFilter}
              options={subFilters.map((sub) => ({ value: sub, label: sub.toUpperCase() }))}
              onChange={(val: string) => {
                const idx = subFilters.indexOf(val as any);
                if (idx !== -1) setMentionFilterIdx(idx);
              }}
              onValueChange={(val: string) => {
                const idx = subFilters.indexOf(val as any);
                if (idx !== -1) setMentionFilterIdx(idx);
              }}
            />
          ) : (
            <View style={styles.subFilterBar}>
              {subFilters.map((sub, idx) => (
                <TouchableOpacity
                  key={sub}
                  style={[styles.subFilterButton, mentionFilterIdx === idx && styles.activeSubFilter]}
                  onPress={() => setMentionFilterIdx(idx)}
                >
                  <Text style={[styles.subFilterText, mentionFilterIdx === idx && styles.activeSubFilterText]}>
                    {sub.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Notification List */}
      <FlatList
        data={displayedNotifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.feed}
        renderItem={({ item }) => (
          <NotificationCard item={item} onPress={() => handleNotificationPress(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No notifications found for this category.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: getColor("BACKGROUND_PRIMARY", "#111214"),
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    color: getColor("HEADER_PRIMARY", "#F2F3F5"),
    fontSize: 20,
    fontWeight: "700",
  },
  clearButtonText: {
    color: getColor("TEXT_DANGER", "#F23F43"),
    fontSize: 14,
    fontWeight: "600",
  },
  pillsWrapper: {
    paddingVertical: 6,
  },
  pillsContainer: {
    paddingHorizontal: 12,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: getColor("BACKGROUND_SECONDARY_ALT", "#2B2D31"),
  },
  activePill: {
    backgroundColor: getColor("BG_BRAND", "#5865F2"),
  },
  pillText: {
    color: getColor("INTERACTIVE_NORMAL", "#949BA4"),
    fontSize: 13,
    fontWeight: "600",
  },
  activePillText: {
    color: "#FFFFFF",
  },
  subFilterWrapper: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  subFilterBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: getColor("BACKGROUND_SECONDARY_ALT", "#1E1F22"),
    borderRadius: 8,
    padding: 3,
  },
  subFilterButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 6,
  },
  activeSubFilter: {
    backgroundColor: getColor("BACKGROUND_SECONDARY", "#2B2D31"),
  },
  subFilterText: {
    color: getColor("INTERACTIVE_MUTED", "#949BA4"),
    fontSize: 11,
    fontWeight: "700",
  },
  activeSubFilterText: {
    color: getColor("HEADER_PRIMARY", "#FFFFFF"),
  },
  feed: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  card: {
    backgroundColor: getColor("BACKGROUND_SECONDARY", "#1E1F22"),
    borderRadius: 12,
    marginVertical: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: getColor("BACKGROUND_MODIFIER_ACCENT", "rgba(255, 255, 255, 0.1)"),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: getColor("BACKGROUND_SECONDARY_ALT", "#2B2D31"),
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  avatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: "#4e5058",
  },
  cardTitle: {
    color: getColor("HEADER_PRIMARY", "#FFFFFF"),
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  timestamp: {
    color: getColor("TEXT_MUTED", "#B5BAC1"),
    fontSize: 11,
  },
  cardBody: {
    padding: 12,
  },
  cardContent: {
    color: getColor("TEXT_NORMAL", "#DBDEE1"),
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  location: {
    color: getColor("TEXT_MUTED", "#B5BAC1"),
    fontSize: 11,
    fontWeight: "500",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: getColor("TEXT_MUTED", "#B5BAC1"),
    fontSize: 14,
  },
});
