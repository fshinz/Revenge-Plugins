import { ReactNative } from "@vendetta/metro/common";
import { before, after } from "@vendetta/patcher";
import { findByProps, findByName } from "@vendetta/metro";

const TAG = "[MessageLogger]";

// Helper to create a text node
function textNode(text: string) {
  return { content: text, type: "text" };
}

// Style the row for deleted messages
function styleDeleted(message: any, info: { content: string; timestamp: string }) {
  // Set text color to red
  message.textColor = ReactNative.processColor("#E44043");

  // Build content: original + (deleted) + timestamp
  let nodes: any[] = [];
  if (Array.isArray(message.content)) {
    nodes = message.content.slice(); // copy
  } else {
    nodes = [textNode(message.content || "")];
  }
  nodes.push(textNode(" (deleted)"));
  if (info.timestamp) {
    nodes.push(textNode(` *${info.timestamp}*`));
  }
  message.content = nodes;
}

// Style the row for edited messages
function styleEdited(message: any, info: { oldContent: string; newContent: string; timestamp: string }) {
  if (message.__loggerEditApplied) return;
  message.__loggerEditApplied = true;

  const nodes: any[] = [];
  nodes.push(textNode(info.oldContent || "(empty)"));
  // Add (edited) tag – we can make it gray by using a link with muted color
  nodes.push({
    type: "link",
    target: "usernameOnClick",
    context: {
      username: 1,
      usernameOnClick: {
        action: "0",
        userId: "0",
        linkColor: ReactNative.processColor("#949BA4"),
        messageChannelId: "0",
      },
      medium: true,
    },
    content: [textNode(" (edited)")],
  });
  nodes.push(textNode("\n↓\n"));
  nodes.push(textNode(info.newContent || "(empty)"));
  // Another edited tag
  nodes.push({
    type: "link",
    target: "usernameOnClick",
    context: {
      username: 1,
      usernameOnClick: {
        action: "0",
        userId: "0",
        linkColor: ReactNative.processColor("#949BA4"),
        messageChannelId: "0",
      },
      medium: true,
    },
    content: [textNode(" (edited)")],
  });
  if (info.timestamp) {
    nodes.push(textNode(` *${info.timestamp}*`));
  }

  message.content = nodes;
}

export function patchRowStyling(deletedMessages: Map<string, any>, editedMessages: Map<string, any>) {
  const cleanups: (() => void)[] = [];

  function handleRow(row: any) {
    const message = row?.message;
    if (!message?.id) return;

    // Deleted?
    if (deletedMessages.has(message.id)) {
      const info = deletedMessages.get(message.id);
      styleDeleted(message, info);
      return;
    }

    // Edited?
    if (editedMessages.has(message.id)) {
      const info = editedMessages.get(message.id);
      styleEdited(message, info);
      return;
    }
  }

  // Try NativeModules.DCDChatManager.updateRows (most common)
  const { NativeModules } = ReactNative;
  if (NativeModules?.DCDChatManager?.updateRows) {
    cleanups.push(
      before("updateRows", NativeModules.DCDChatManager, (args: any[]) => {
        try {
          const rows = JSON.parse(args[1]);
          for (const row of rows) handleRow(row);
          args[1] = JSON.stringify(rows);
        } catch {}
      })
    );
  } else {
    // Fallback: RowManager.prototype.generate
    const RowManager = findByProps("RowManager") || findByName("RowManager");
    if (RowManager?.prototype?.generate) {
      cleanups.push(
        after("generate", RowManager.prototype, (_args: any[], row: any) => {
          try {
            handleRow(row);
          } catch {}
        })
      );
    } else {
      console.warn(TAG, "No row patching method found – styling disabled.");
    }
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}