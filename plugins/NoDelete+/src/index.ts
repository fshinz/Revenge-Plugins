import { findByStoreName, findByProps } from "@vendetta/metro";
import { FluxDispatcher, moment } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { before as patchBefore, after as patchAfter } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import Settings from "./settings";
import { patchContextMenu } from "./patches/contextMenu";
import { patchEditStyling } from "./patches/editStyling";
import { addEmbedLogEntry, snapshotForLog } from "./lib/embedLog";

let MessageStore: any;
let AuthStore: any;

const patches: (() => void)[] = [];
const deletedCache = new Map<string, any>();
const editMap = new Map<string, string[]>();
const commandMap = new Map<string, string>();

storage.ignore ??= {
  users: [],
  bots: false,
  ownMessages: false,
};
storage.logEdits ??= true;
storage.showToast ??= false;

const DELETED_TEXT = "This message was deleted";

function buildAutomodMessage(text: string, timestamp: string): string {
  return `${text} (${timestamp})`;
}

function cloneSnapshot(msg: any) {
  if (!msg) return null;

  return {
    ...msg,
    content: msg.content || "",
    embeds: Array.isArray(msg.embeds) ? JSON.parse(JSON.stringify(msg.embeds)) : [],
    components: Array.isArray(msg.components) ? JSON.parse(JSON.stringify(msg.components)) : [],
    attachments: Array.isArray(msg.attachments) ? JSON.parse(JSON.stringify(msg.attachments)) : [],
    flags: msg.flags || 0,
    deletedAt: msg.deletedAt || moment().format("HH:mm:ss"),
  };
}

export default {
  onLoad() {
    try {
      MessageStore = findByStoreName("MessageStore");
      AuthStore = findByStoreName("AuthenticationStore") || findByProps("getToken");

      patches.push(
        patchAfter("getMessage", MessageStore, (args, result) => {
          const [_channelId, id] = args;
          if (!result || result.embeds?.length) return result;

          const cached = deletedCache.get(id);
          if (cached?.embeds?.length) {
            result.embeds = cached.embeds;
          }
          return result;
        })
      );

      const getCurrentUserId = () =>
        AuthStore?.getCurrentUser?.()?.id ||
        AuthStore?.getId?.() ||
        MessageStore?.getCurrentUser?.()?.id;

      patches.push(
        patchBefore("dispatch", FluxDispatcher, (args) => {
          const event = args[0];
          if (!event?.type || event.type !== "MESSAGE_CREATE") return;

          const msg = event.message;
          if (!msg?.channel_id) return;

          const currentUserId = getCurrentUserId();
          if (msg.author?.id === currentUserId) return;

          if (msg.nonce) {
            const existing = MessageStore?.getMessage(msg.channel_id, msg.nonce);
            if (existing && existing.id !== msg.id) {
              if (!deletedCache.has(existing.id)) {
                deletedCache.set(existing.id, cloneSnapshot(existing));
              }
              delete msg.nonce;
            }
          }

          // Command / Interaction Nonce Matching & Deduplication
          const interactionId =
            msg.interaction_metadata?.id ||
            msg.interaction?.id ||
            msg.nonce;

          if (interactionId) {
            const existingCmdMessageId = commandMap.get(String(interactionId));
            
            // Check if this command response was already dispatched under a previous ID
            if (existingCmdMessageId && existingCmdMessageId !== msg.id) {
              const existingMsg = MessageStore?.getMessage(msg.channel_id, existingCmdMessageId);
              if (existingMsg && !deletedCache.has(existingCmdMessageId)) {
                deletedCache.set(existingCmdMessageId, cloneSnapshot(existingMsg));
              }
              delete msg.nonce;
            } else {
              commandMap.set(String(interactionId), String(msg.id));
              if (commandMap.size > 1000) {
                const firstKey = commandMap.keys().next().value;
                if (firstKey) commandMap.delete(firstKey);
              }
            }
          }

          const referencedInteractionId =
            msg.referenced_message?.interaction_metadata?.id ||
            msg.referenced_message?.interaction?.id;

          if (referencedInteractionId) {
            commandMap.set(String(referencedInteractionId), String(msg.id));
          }
        })
      );

      patches.push(
        patchBefore("dispatch", FluxDispatcher, (args) => {
          const event = args[0];
          if (!event?.type || event.type !== "MESSAGE_DELETE") return;

          const { channelId, id, mlDeleted } = event;
          if (!id || !channelId) return;

          const existing = MessageStore?.getMessage(channelId, id);
          if (existing && !deletedCache.has(id)) {
            deletedCache.set(id, cloneSnapshot(existing));
          }

          if (mlDeleted) {
            delete event.mlDeleted;
          }
        })
      );

      patches.push(
        patchBefore("dispatch", FluxDispatcher, (args) => {
          const event = args[0];
          if (event?.type !== "MESSAGE_DELETE" || !event?.id || !event?.channelId) return;

          const currentUserId = getCurrentUserId();
          const cachedMsg =
            MessageStore?.getMessage(event.channelId, event.id) || deletedCache.get(event.id);

          if (!cachedMsg) return;

          if (storage.ignore?.users?.includes(cachedMsg.author?.id)) return;
          if (storage.ignore?.bots && cachedMsg.author?.bot) return;
          if (storage.ignore?.ownMessages && cachedMsg.author?.id === currentUserId) return;

          if (!deletedCache.has(event.id)) {
            deletedCache.set(event.id, cloneSnapshot(cachedMsg));
          }

          const snapshot = deletedCache.get(event.id);
          addEmbedLogEntry(snapshotForLog(snapshot, "deleted"));

          const time = snapshot?.deletedAt || moment().format("HH:mm:ss");
          const automodMessage = buildAutomodMessage(DELETED_TEXT, time);

          args[0] = {
            type: "MESSAGE_EDIT_FAILED_AUTOMOD",
            messageData: {
              type: 1,
              message: {
                ...snapshot,
                channelId: event.channelId,
                messageId: event.id,
                content: snapshot?.content || "",
                embeds: snapshot?.embeds || [],
                components: snapshot?.components || [],
                attachments: snapshot?.attachments || [],
                flags: snapshot?.flags || 0,
              },
            },
            errorResponseBody: {
              code: 200000,
              message: automodMessage,
            },
          };
        })
      );

      patches.push(
        patchBefore("dispatch", FluxDispatcher, (args) => {
          const event = args[0];
          if (event?.type !== "MESSAGE_DELETE_BULK" || !event?.ids?.length || !event?.channelId) return;

          const currentUserId = getCurrentUserId();
          const time = moment().format("HH:mm:ss");
          const automodMessage = buildAutomodMessage(DELETED_TEXT, time);
          let validCount = 0;

          for (const id of event.ids) {
            const cachedMsg =
              MessageStore?.getMessage(event.channelId, id) || deletedCache.get(id);

            if (!cachedMsg) continue;
            if (storage.ignore?.users?.includes(cachedMsg.author?.id)) continue;
            if (storage.ignore?.bots && cachedMsg.author?.bot) continue;
            if (storage.ignore?.ownMessages && cachedMsg.author?.id === currentUserId) continue;

            if (!deletedCache.has(id)) {
              deletedCache.set(id, cloneSnapshot({ ...cachedMsg, deletedAt: time }));
            }

            const snapshot = deletedCache.get(id);
            addEmbedLogEntry(snapshotForLog(snapshot, "deleted"));
            validCount++;

            FluxDispatcher.dispatch({
              type: "MESSAGE_EDIT_FAILED_AUTOMOD",
              messageData: {
                type: 1,
                message: {
                  ...snapshot,
                  channelId: event.channelId,
                  messageId: id,
                  content: snapshot?.content || "",
                  embeds: snapshot?.embeds || [],
                  components: snapshot?.components || [],
                  attachments: snapshot?.attachments || [],
                  flags: snapshot?.flags || 0,
                },
              },
              errorResponseBody: {
                code: 200000,
                message: automodMessage,
              },
            });
          }

          if (validCount > 0) {
            args[0] = { type: "NOOP" };
          }
        })
      );

      // Preserve & Log Message Edits (Checks storage.logEdits toggle)
      patches.push(
        patchBefore("dispatch", FluxDispatcher, (args) => {
          const event = args[0];
          if (event?.type !== "MESSAGE_UPDATE" || !event?.message) return;

          // Check setting toggle
          if (!storage.logEdits) return;

          const newMsg = event.message;
          if (!newMsg.id || !newMsg.channel_id) return;

          const currentUserId = getCurrentUserId();
          if (storage.ignore?.users?.includes(newMsg.author?.id)) return;
          if (storage.ignore?.bots && newMsg.author?.bot) return;
          if (storage.ignore?.ownMessages && newMsg.author?.id === currentUserId) return;

          const oldMsg =
            MessageStore?.getMessage(newMsg.channel_id, newMsg.id) ||
            deletedCache.get(newMsg.id);

          if (oldMsg && oldMsg.embeds?.length && !newMsg.embeds?.length) {
            newMsg.embeds = JSON.parse(JSON.stringify(oldMsg.embeds));
          }

          if (oldMsg && oldMsg.components?.length && !newMsg.components?.length) {
            newMsg.components = JSON.parse(JSON.stringify(oldMsg.components));
          }

          if (!newMsg.content || newMsg.content.trim() === "") return;
          if (!oldMsg || !oldMsg.content || oldMsg.content === newMsg.content) return;

          let history = editMap.get(newMsg.id) || [];
          if (history.length === 0 || history[history.length - 1] !== oldMsg.content) {
            history.push(oldMsg.content);
          }

          if (history.length > 5) {
            history = history.slice(-5);
          }

          editMap.set(newMsg.id, history);
          addEmbedLogEntry(snapshotForLog(newMsg, "edited", newMsg.content));
        })
      );

      patches.push(patchEditStyling(editMap));
      patches.push(patchContextMenu());

      // Check setting toggle before showing toast
      if (storage.showToast) {
        showToast("Message Logger loaded", getAssetIDByName("Check"));
      }
    } catch (e) {
      console.error("[MessageLogger] Load error:", e);
      if (storage.showToast) {
        showToast("Failed to load Message Logger", getAssetIDByName("Small"));
      }
    }
  },

  onUnload() {
    for (const unpatch of patches) {
      try {
        unpatch();
      } catch (_) {}
    }

    patches.length = 0;
    deletedCache.clear();
    editMap.clear();
    commandMap.clear();

    if (storage.showToast) {
      showToast("Message Logger unloaded", getAssetIDByName("Check"));
    }
  },

  settings: Settings,
};
