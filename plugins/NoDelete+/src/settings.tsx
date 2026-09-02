import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { Forms } from "@vendetta/ui/components";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableSwitchRow, TableRow, Stack } = findByProps(
  "TableSwitchRow",
  "TableCheckboxRow",
  "TableRowGroup",
  "Stack",
  "TableRow"
);
const { FormText } = Forms;

let UserStore: any;

export default function Settings() {
  UserStore ??= findByStoreName("UserStore");
  useProxy(storage);

  // Storage initialization
  storage.ignore ??= {
    users: [],
    bots: false,
    ownMessages: false,
    botEdits: false,
    ownEdits: false,
  };
  storage.logEdits ??= true;
  storage.showToast ??= false;

  const users: string[] = storage.ignore.users || [];

  const handleClearUsers = () => {
    if (users.length === 0) return;
    showConfirmationAlert({
      title: "Clear Ignored Users",
      content: `Remove all ${users.length} users from the ignore list?`,
      confirmText: "Clear All",
      cancelText: "Cancel",
      onConfirm: () => {
        storage.ignore.users = [];
        showToast("Cleared all ignored users", getAssetIDByName("Check"));
      },
    });
  };

  const handleRemoveUser = (id: string) => {
    storage.ignore.users = users.filter((uId) => uId !== id);
    showToast("User removed from ignore list", getAssetIDByName("Check"));
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        {/* General Settings */}
        <TableRowGroup title="General Settings">
          <TableSwitchRow
            label="Log Edited Messages"
            subLabel="Track edit history and original message content"
            value={!!storage.logEdits}
            onValueChange={(v: boolean) => {
              storage.logEdits = v;
            }}
          />
          <TableSwitchRow
            label="Show Load Toast"
            subLabel="Display a toast notification when plugin is loaded"
            value={!!storage.showToast}
            onValueChange={(v: boolean) => {
              storage.showToast = v;
            }}
          />
        </TableRowGroup>

        {/* Message Deletion Filters */}
        <TableRowGroup title="Deletion Filters">
          <TableSwitchRow
            label="Ignore Bots"
            subLabel="Don't log deleted messages from bots"
            value={!!storage.ignore.bots}
            onValueChange={(v: boolean) => {
              storage.ignore.bots = v;
            }}
          />
          <TableSwitchRow
            label="Ignore My Own Messages"
            subLabel="Don't log deletions of your own messages"
            value={!!storage.ignore.ownMessages}
            onValueChange={(v: boolean) => {
              storage.ignore.ownMessages = v;
            }}
          />
        </TableRowGroup>

        {/* Message Edit Filters */}
        <TableRowGroup title="Edit Filters">
          <TableSwitchRow
            label="Log Edited Messages From Bots"
            subLabel="Track edit history for messages sent by bots"
            value={!storage.ignore.botEdits}
            onValueChange={(v: boolean) => {
              storage.ignore.botEdits = !v;
            }}
          />
          <TableSwitchRow
            label="Log Edited Messages From You"
            subLabel="Track edit history for your own messages"
            value={!storage.ignore.ownEdits}
            onValueChange={(v: boolean) => {
              storage.ignore.ownEdits = !v;
            }}
          />
        </TableRowGroup>

        {/* Ignored Users Section */}
        <TableRowGroup title={`Ignored Users (${users.length})`}>
          {users.length > 0 && (
            <TableRow
              label="Clear Ignored List"
              subLabel="Mass remove all currently ignored users"
              trailing={
                <RN.Image
                  source={getAssetIDByName("TrashIcon")}
                  style={{ width: 20, height: 20, tintColor: "#ff4d4d" }}
                />
              }
              onPress={handleClearUsers}
            />
          )}

          {users.length === 0 ? (
            <FormText style={{ padding: 16, opacity: 0.6 }}>
              No users are currently ignored.
            </FormText>
          ) : (
            users.map((id: string) => {
              const user = UserStore?.getUser(id);
              const name = user?.username ? `@${user.username}` : id;
              return (
                <TableRow
                  key={id}
                  label={name}
                  subLabel={`ID: ${id}`}
                  trailing={
                    <RN.TouchableOpacity onPress={() => handleRemoveUser(id)}>
                      <RN.Image
                        source={getAssetIDByName("TrashIcon")}
                        style={{ width: 20, height: 20, tintColor: "#ff4d4d" }}
                      />
                    </RN.TouchableOpacity>
                  }
                />
              );
            })
          )}
        </TableRowGroup>
      </Stack>
    </ScrollView>
  );
}
