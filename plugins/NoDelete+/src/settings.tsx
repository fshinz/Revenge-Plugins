import React from "react";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { Forms } from "@vendetta/ui/components";

const { FormText, FormRow, FormSwitchRow, FormSection } = Forms;

// Safe Metro resolvers with native Vendetta fallbacks
const TableRowGroupModule = findByProps("TableRowGroup") || findByProps("TableGroup");
const TableRowGroupComponent = TableRowGroupModule?.TableRowGroup || TableRowGroupModule?.TableGroup || FormSection;

const TableSwitchRowComponent =
  findByProps("TableSwitchRow")?.TableSwitchRow ||
  findByProps("TableRowExtra")?.TableSwitchRow ||
  FormSwitchRow;

const StackComponent =
  findByProps("Stack")?.Stack ||
  findByProps("TableRowGroup", "Stack")?.Stack ||
  (({ children }: any) => children);

const ScrollViewComponent =
  findByProps("ScrollView")?.ScrollView ||
  findByProps("TableScrollView")?.ScrollView ||
  require("react-native").ScrollView;

let UserStore: any;

export default function Settings() {
  UserStore ??= findByStoreName("UserStore");
  useProxy(storage);

  storage.ignore ??= { users: [], bots: false, ownMessages: false };
  const [users, setUsers] = React.useState<string[]>(storage.ignore.users || []);

  const handleRemoveUser = (userId: string) => {
    const newArr = users.filter((id: string) => id !== userId);
    storage.ignore.users = newArr;
    setUsers(newArr);
    showToast("User removed from ignore list", getAssetIDByName("Check"));
  };

  const handleClearUsers = () => {
    if (users.length === 0) return;
    showConfirmationAlert({
      title: "Clear Ignored Users",
      content: `Remove all ${users.length} users from ignore list?`,
      confirmText: "Clear",
      cancelText: "Cancel",
      onConfirm: () => {
        storage.ignore.users = [];
        setUsers([]);
        showToast("Cleared all ignored users", getAssetIDByName("Check"));
      },
    });
  };

  const TableRowGroup = TableRowGroupComponent;
  const TableSwitchRow = TableSwitchRowComponent;
  const Stack = StackComponent;
  const ScrollView = ScrollViewComponent;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        <TableRowGroup title="Filters">
          <TableSwitchRow
            label="Ignore Bots"
            subLabel="Don't log messages from bots"
            value={!!storage.ignore.bots}
            onValueChange={(v: boolean) => {
              storage.ignore.bots = v;
            }}
          />
          <TableSwitchRow
            label="Ignore My Own Messages"
            subLabel="Don't log deletions or edits of your own messages"
            value={!!storage.ignore.ownMessages}
            onValueChange={(v: boolean) => {
              storage.ignore.ownMessages = v;
            }}
          />
        </TableRowGroup>

        <TableRowGroup title="Ignored Users">
          <FormRow
            label="Clear All"
            subLabel={`${users.length} users ignored`}
            trailing={<FormRow.Icon source={getAssetIDByName("ic_trash_24px")} />}
            onPress={handleClearUsers}
          />

          {users.length === 0 ? (
            <FormText style={{ padding: 12 }}>No users ignored.</FormText>
          ) : (
            users.map((id: string) => {
              const user = UserStore?.getUser(id);
              const name = user?.username ? `@${user.username}` : id;
              return (
                <FormRow
                  key={id}
                  label={name}
                  trailing={
                    <FormRow.Icon
                      source={getAssetIDByName("ic_close_24px")}
                      onPress={() => handleRemoveUser(id)}
                    />
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
