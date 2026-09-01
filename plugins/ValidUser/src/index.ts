import { findByProps } from "@vendetta/metro";
import { before, after, instead } from "@vendetta/patcher";
import { logger } from "@vendetta";
import { React } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");

const Dispatcher = findByProps("dispatch", "subscribe");
const RestAPI = findByProps("get", "post", "del", "patch");
const GatewayConnection = findByProps("getGateway", "send");
const SelectedGuildStore = findByProps("getGuildId", "getChannelId");
const UserStore = findByProps("getUser", "getCurrentUser");
const UserUtils = findByProps("fetchProfile", "getUser", "fetchUser");
const AvatarUtils = findByProps("getDefaultAvatarURL", "getUserAvatarURL");

const MentionIcon = getAssetIDByName("ic_mention_24px") ??
    getAssetIDByName("MentionIcon") ??
    getAssetIDByName("mention");

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MENTION_REGEX = /<@!?(\d{17,19})>/g;

// Calculates the exact 0-5 avatar index using Discord's snowflake formula
function getDefaultAvatarIndex(userId?: string): number {
    if (!userId) return 0;
    try {
        return Number((BigInt(userId) >> 22n) % 6n);
    } catch {
        return 0;
    }
}

// Maps the snowflake index to default_avatar_0 through default_avatar_5 (and _small variants)
function getDefaultAvatarAsset(userId?: string, small = false): number {
    const index = getDefaultAvatarIndex(userId);
    const suffix = small ? "_small" : "";

    return getAssetIDByName(`default_avatar_${index}${suffix}`) ??
           getAssetIDByName(`default_avatar_${index}`) ??
           getAssetIDByName("default_avatar_0") ??
           getAssetIDByName("default_avatar_0_small");
}

function extractIdsFromText(text: string): string[] {
    if (!text) return [];
    return [...text.matchAll(MENTION_REGEX)].map(x => x[1]).filter(id => !isUserCached(id));
}

function extractIdsFromComponents(components: any[]): string[] {
    const ids: string[] = [];
    if (!Array.isArray(components)) return ids;

    for (const component of components) {
        if (!component) continue;

        if (component.type === 10 || typeof component.content === "string") {
            ids.push(...extractIdsFromText(component.content));
        }

        if (Array.isArray(component.components)) {
            ids.push(...extractIdsFromComponents(component.components));
        }
    }
    return ids;
}

function extractAllMentionIds(message: any): string[] {
    const ids: string[] = [];

    if (message.content) {
        ids.push(...extractIdsFromText(message.content));
    }

    if (message.embeds && Array.isArray(message.embeds)) {
        for (const embed of message.embeds) {
            if (embed.rawTitle) {
                ids.push(...extractIdsFromText(embed.rawTitle));
            }
            if (embed.rawDescription) {
                ids.push(...extractIdsFromText(embed.rawDescription));
            }
            if (embed.fields && Array.isArray(embed.fields)) {
                for (const field of embed.fields) {
                    if (field.rawName) ids.push(...extractIdsFromText(field.rawName));
                    if (field.rawValue) ids.push(...extractIdsFromText(field.rawValue));
                }
            }
        }
    }

    if (Array.isArray(message.components)) {
        ids.push(...extractIdsFromComponents(message.components));
    }

    if (Array.isArray(message.messageSnapshots)) {
        for (const snapshot of message.messageSnapshots) {
            const snap = snapshot.message;
            if (snap) {
                if (snap.content) {
                    ids.push(...extractIdsFromText(snap.content));
                }
                if (snap.embeds && Array.isArray(snap.embeds)) {
                    for (const embed of snap.embeds) {
                        if (embed.rawTitle) {
                            ids.push(...extractIdsFromText(embed.rawTitle));
                        }
                        if (embed.rawDescription) {
                            ids.push(...extractIdsFromText(embed.rawDescription));
                        }
                        if (embed.fields && Array.isArray(embed.fields)) {
                            for (const field of embed.fields) {
                                if (field.rawName) ids.push(...extractIdsFromText(field.rawName));
                                if (field.rawValue) ids.push(...extractIdsFromText(field.rawValue));
                            }
                        }
                    }
                }
                if (Array.isArray(snap.components)) {
                    ids.push(...extractIdsFromComponents(snap.components));
                }
            }
        }
    }

    return [...new Set(ids)];
}

function isUserCached(userId: string): boolean {
    return !!UserStore?.getUser?.(userId);
}

function createDeletedUserPayload(userId: string) {
    return {
        id: userId,
        username: "Deleted User",
        global_name: null,
        globalName: null,
        discriminator: "0000",
        avatar: null,
        avatarDecorationData: null,
        bot: false,
        system: false,
        flags: 0,
        publicFlags: 0,
        public_flags: 0,
        guildMemberAvatars: {},
        defaultAvatarIndex: getDefaultAvatarIndex(userId)
    };
}

function cloneComponents(components: any[]): any[] {
    const clone = JSON.parse(JSON.stringify(components ?? []));

    function hasTextNodes(nodes: any[]): boolean {
        for (const node of nodes) {
            if (!node) continue;
            if (node.type === 10 || typeof node.content === "string") {
                node.content = node.content + "\u200b";
                return true;
            }
            if (Array.isArray(node.components) && hasTextNodes(node.components)) {
                return true;
            }
        }
        return false;
    }

    hasTextNodes(clone);
    return clone;
}

function hslaStringToInt(hsla: string): number {
    const match = hsla.match(
        /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*[\d.]+\s*)?\)$/i
    );
    if (!match) return 1974050;

    const h = parseFloat(match[1]) / 360;
    const s = parseFloat(match[2]) / 100;
    const l = parseFloat(match[3]) / 100;

    if (s === 0) {
        const gray = Math.round(l * 255);
        return (gray << 16) | (gray << 8) | gray;
    }

    const hueToRgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const r = Math.round(hueToRgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hueToRgb(p, q, h) * 255);
    const b = Math.round(hueToRgb(p, q, h - 1 / 3) * 255);

    return (r << 16) | (g << 8) | b;
}

function normalizeEmbedColor(color: string | number | null | undefined): number {
    if (color === undefined || color === null) return 1974050;
    if (typeof color === "number") return color;
    if (typeof color === "string" && color.startsWith("hsl")) {
        return hslaStringToInt(color);
    }
    return 1974050;
}

function toRawEmbed(embed: any): any {
    if (!embed) return embed;

    const raw: any = {
        type: embed.type,
        url: embed.url,
        color: normalizeEmbedColor(embed.color),
        timestamp: embed.timestamp,
        title: embed.rawTitle ?? (typeof embed.title === "string" ? embed.title : undefined),
        description: embed.rawDescription ?? (typeof embed.description === "string" ? embed.description : undefined),
        author: embed.author ? {
            name: embed.author.name,
            url: embed.author.url,
            icon_url: embed.author.iconURL ?? embed.author.icon_url,
            proxy_icon_url: embed.author.iconProxyURL ?? embed.author.proxy_icon_url
        } : undefined,
        image: embed.image ? {
            url: embed.image.url,
            proxy_url: embed.image.proxyURL,
            width: embed.image.width,
            height: embed.image.height,
        } : undefined,
        thumbnail: embed.thumbnail ? {
            url: embed.thumbnail.url,
            proxy_url: embed.thumbnail.proxyURL,
            width: embed.thumbnail.width,
            height: embed.thumbnail.height,
        } : undefined,
        video: embed.video,
        provider: embed.provider,
        footer: embed.footer ? {
            icon_url: embed.footer.iconURL ?? embed.footer.icon_url,
            proxy_icon_url: embed.footer.iconProxyURL ?? embed.footer.proxy_icon_url,
            ...embed.footer
        } : undefined,
    };

    if (Array.isArray(embed.fields)) {
        raw.fields = embed.fields.map((field: any) => ({
            name: field.rawName ?? (typeof field.name === "string" ? field.name : ""),
            value: field.rawValue ?? (typeof field.value === "string" ? field.value : ""),
            inline: field.inline,
        }));
    }

    return raw;
}

const IS_COMPONENTS_V2 = 1 << 15;

function hasComponentsV2Flag(flags: number | undefined): boolean {
    return typeof flags === "number" && (flags & IS_COMPONENTS_V2) === IS_COMPONENTS_V2;
}

async function forceUIRefresh(channelId: string, msg: any) {
    const freshContent = msg.content ? msg.content + "\u200b " : " ";
    const components = msg.components;
    const embeds = msg.embeds;
    const hasComponents = Array.isArray(components) && components.length > 0;
    const isCV2 = hasComponentsV2Flag(msg.flags);

    Dispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: {
            id: msg.id,
            channel_id: channelId,
            content: freshContent,
            embeds: embeds
        }
    });
    await sleep(110);

    if (isCV2) {
        Dispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: {
                id: msg.id,
                channel_id: channelId,
                components: hasComponents ? cloneComponents(components) : components,
                flags: msg.flags
            }
        });
    } else {
        Dispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: {
                id: msg.id,
                channel_id: channelId,
                content: msg.content,
                attachments: msg.attachments,
                embeds: Array.isArray(embeds) && embeds.length > 0 ? embeds.map(toRawEmbed) : embeds,
                components: components
            }
        });
    }
}

async function fetchUsersViaGateway(userIds: string[]): Promise<boolean> {
    const currentGuildId = SelectedGuildStore?.getGuildId?.();
    if (!currentGuildId) return false;

    const ws = GatewayConnection?.getGateway?.();
    if (!ws) return false;

    try {
        ws.send(8, {
            guild_id: [currentGuildId],
            limit: 100,
            user_ids: userIds,
            presences: true
        });
    } catch (err) {
        logger.error("[ValidUser] Gateway send failed:", err);
        return false;
    }

    await sleep(400); 
    return true;
}

async function fetchUser(userId: string) {
    if (typeof UserUtils?.fetchUser === "function") {
        try {
            return await UserUtils.fetchUser(userId);
        } catch (e) {
            logger.warn(`[ValidUser] UserUtils.fetchUser failed for ${userId}, trying REST fallback:`, e);
        }
    }

    try {
        const res = await RestAPI.get({ url: `/users/${userId}` });
        if (res.body) {
            const normalizedUser = {
                ...res.body,
                discriminator: res.body.discriminator ?? "0",
                bot: !!res.body.bot,
                avatar: res.body.avatar ?? null,
            };

            Dispatcher.dispatch({
                type: "USER_UPDATE",
                user: normalizedUser
            });
            return normalizedUser.username;
        }
    } catch (err) {
        logger.warn(`[ValidUser] User ${userId} non-existent or deleted. Dispatching Deleted User payload...`);
        Dispatcher.dispatch({
            type: "USER_UPDATE",
            user: createDeletedUserPayload(userId)
        });
        return "Deleted User";
    }

    throw new Error("Empty API response body");
}

async function fixUnknownMentions(message: any) {
    const ids = extractAllMentionIds(message);
    const channelId = message.channelId || message.channel_id;
    const messageId = message.id;

    if (ids.length === 0) return;

    const uncachedIds = ids.filter(id => !isUserCached(id));

    if (uncachedIds.length > 0) {
        const BULK_THRESHOLD = 5;
        let success = false;

        if (uncachedIds.length > BULK_THRESHOLD && SelectedGuildStore?.getGuildId?.()) {
            success = await fetchUsersViaGateway(uncachedIds);
        }

        if (!success) {
            const safetyDelay = uncachedIds.length > 10 ? 900 : 250;

            for (let i = 0; i < uncachedIds.length; i++) {
                const userId = uncachedIds[i];
                try {
                    await fetchUser(userId);
                } catch (err) {
                    logger.error(`[ValidUser] Fetch Failed for ${userId}:`, err);
                }
                if (i < uncachedIds.length - 1) {
                    await sleep(safetyDelay);
                }
            }
        }
    }

    await sleep(200);

    // Final safety check for missing accounts
    const stillUncached = ids.filter(id => !isUserCached(id));
    if (stillUncached.length > 0) {
        for (const missingId of stillUncached) {
            Dispatcher.dispatch({
                type: "USER_UPDATE",
                user: createDeletedUserPayload(missingId)
            });
        }
    }

    if (channelId && messageId) {
        await forceUIRefresh(channelId, message);
    }
}

let unpatches: (() => void)[] = [];

export default {
    onLoad() {
        // Safe interceptor for getDefaultAvatarURL returning the computed asset ID
        if (AvatarUtils?.getDefaultAvatarURL) {
            unpatches.push(
                instead("getDefaultAvatarURL", AvatarUtils, (args, orig) => {
                    const [user] = args;
                    if (!user || !user.id || typeof user.id !== "string") {
                        return getDefaultAvatarAsset(user?.id);
                    }
                    try {
                        return orig(...args);
                    } catch (err) {
                        logger.warn("[ValidUser] Safe catch in getDefaultAvatarURL:", err);
                        return getDefaultAvatarAsset(user.id);
                    }
                })
            );
        }

        const unpatchOpenLazy = before("openLazy", ActionSheet, ([comp, args, msg]) => {
            if (args !== "MessageLongPressActionSheet" || !msg?.message) return;

            const message = msg.message;
            const ids = extractAllMentionIds(message);

            if (ids.length === 0) return;

            comp.then((instance: any) => {
                const unpatch = after("default", instance, (_: any, component: any) => {
                    React.useEffect(() => () => { unpatch(); }, []);

                    const groups: any[] = findInReactTree(
                        component,
                        (c: any) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
                    );

                    if (!groups?.length) {
                        return;
                    }

                    const fixButton = React.createElement(ActionSheetRow, {
                        label: ids.length === 1 ? "Fix 1 @Mention" : `Fix ${ids.length} @Mentions`,
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: MentionIcon,
                        }),
                        onPress: () => {
                            ActionSheet.hideActionSheet();
                            fixUnknownMentions(message);
                        },
                    });

                    let inserted = false;
                    for (let gi = 0; gi < groups.length; gi++) {
                        const groupChildren: any[] = findInReactTree(
                            groups[gi],
                            (c: any) => Array.isArray(c) && c.some((child: any) =>
                                child?.type?.name === "ActionSheetRow"
                            )
                        );
                        if (!groupChildren) continue;

                        groupChildren.unshift(fixButton);
                        inserted = true;
                        break;
                    }

                    if (!inserted) {
                        groups.unshift(
                            React.createElement(ActionSheetRow.Group, null, fixButton)
                        );
                    }
                });
            }).catch((err: any) => {
                logger.error("[ValidUser] Failed to resolve action sheet component:", err);
            });
        });

        unpatches.push(unpatchOpenLazy);
    },

    onUnload() {
        for (const unpatch of unpatches) {
            try { unpatch(); } catch {}
        }
        unpatches = [];
    },
};
