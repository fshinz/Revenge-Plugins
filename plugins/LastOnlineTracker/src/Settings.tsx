import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findByProps } from "@vendetta/metro";

const { ScrollView } = findByProps("ScrollView");

const { TableRowGroup, TableSwitchRow, Stack } = findByProps(
    "TableSwitchRow",
    "TableRowGroup",
    "Stack"
);

const FormText =
    findByProps("FormText")?.FormText ||
    findByProps("Text")?.Text;

export default function Settings() {
    useProxy(storage);

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12 }}
        >
            <Stack spacing={16}>
                <TableRowGroup title="Where to show last online status">
                    {FormText && (
                        <FormText
                            style={{
                                paddingHorizontal: 12,
                                paddingBottom: 4,
                                opacity: 0.6,
                                fontSize: 12
                            }}
                        >
                            Control where the last seen indicator renders across mobile UI surfaces.
                        </FormText>
                    )}

                    <TableSwitchRow
                        label="Show Last Online on DM Header"
                        subLabel="Display last seen status directly below the user's name in DM headers"
                        value={storage.dmTopBar ?? true}
                        onValueChange={v => {
                            storage.dmTopBar = v;
                        }}
                    />

                    <TableSwitchRow
                        label="Show Last Online in Member/DM List"
                        subLabel="Render indicator inside member rows and direct message list entries"
                        value={storage.userList ?? true}
                        onValueChange={v => {
                            storage.userList = v;
                        }}
                    />

                    <TableSwitchRow
                        label="Show Last Online on User Profiles"
                        subLabel="Inject timestamp next to the display name on user profile cards"
                        value={storage.profileUsername ?? true}
                        onValueChange={v => {
                            storage.profileUsername = v;
                        }}
                    />
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}