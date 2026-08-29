import { ReactNative } from "@vendetta/metro/common";
import { before, after } from "@vendetta/patcher";
import { findByProps, findByName } from "@vendetta/metro";

const TAG = "[MessageLogger]";

function textNode(text: string) {
  return { content: text, type: "text" };
}

function editedTagNode() {
  return {
    type: "link",
    target: "edited",
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
  };
}

export function patchEditStyling(editMap: Map<string, string[]>) {
  const cleanups: (() => void)[] = [];

  function handleRow(row: any) {
    const message = row?.message;
    if (!message?.id) return;

    const history = editMap.get(message.id);
    if (!history || history.length === 0) return;
    if (message.__loggerEditApplied) return;
    message.__loggerEditApplied = true;

    const nodes: any[] = [];
    // Show each previous version with (edited) tag and arrow
    for (let i = 0; i < history.length; i++) {
      nodes.push(textNode(history[i] || "(empty)"));
      nodes.push(editedTagNode());
      if (i < history.length - 1) {
        nodes.push(textNode("\n↓\n"));
      }
    }
    // Finally show current content (without (edited) tag because it's the final version)
    // The current content is already in the message; we could just keep it, but we need to preserve its original nodes.
    // We'll append the current content after the history.
    const currentContent = Array.isArray(message.content) ? message.content : [textNode(message.content || "")];
    // Add a separator if there's history
    if (history.length > 0) {
      nodes.push(textNode("\n↓\n"));
    }
    // Push current content nodes
    for (const node of currentContent) {
      nodes.push(node);
    }
    message.content = nodes;
  }

  // Try DCDChatManager first
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
    const RowManager = findByProps("RowManager") || findByName("RowManager");
    if (RowManager?.prototype?.generate) {
      cleanups.push(
        after("generate", RowManager.prototype, (_args: any[], row: any) => {
          try { handleRow(row); } catch {}
        })
      );
    } else {
      console.warn(TAG, "Row styling unavailable");
    }
  }

  return () => { for (const fn of cleanups) fn(); };
}
