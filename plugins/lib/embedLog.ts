import { storage } from "@vendetta/plugin";

export interface LoggedEmbedMessage {
  id: string;
  channelId: string;
  guildId?: string;
  authorId?: string;
  authorUsername?: string;
  content: string;
  newContent?: string;
  kind: "deleted" | "edited";
  loggedAt: number;
  embeds: any[];
  components: any[];
  attachments: any[];
}

const MAX_LOG_ENTRIES = 500;

export function getEmbedLog(): LoggedEmbedMessage[] {
  (storage as any).embedLog ??= [];
  return (storage as any).embedLog;
}

export function addEmbedLogEntry(entry: LoggedEmbedMessage) {
  const log = getEmbedLog();
  log.push(entry);
  if (log.length > MAX_LOG_ENTRIES) {
    (storage as any).embedLog = log.slice(log.length - MAX_LOG_ENTRIES);
  }
}

export function snapshotForLog(msg: any, kind: "deleted" | "edited", newContent?: string): LoggedEmbedMessage {
  return {
    id: String(msg?.id ?? ""),
    channelId: String(msg?.channel_id ?? msg?.channelId ?? ""),
    guildId: msg?.guild_id ?? msg?.guildId,
    authorId: msg?.author?.id,
    authorUsername: msg?.author?.username,
    content: msg?.content || "",
    newContent,
    kind,
    loggedAt: Date.now(),
    embeds: Array.isArray(msg?.embeds) ? JSON.parse(JSON.stringify(msg.embeds)) : [],
    components: Array.isArray(msg?.components) ? JSON.parse(JSON.stringify(msg.components)) : [],
    attachments: Array.isArray(msg?.attachments) ? JSON.parse(JSON.stringify(msg.attachments)) : [],
  };
}
