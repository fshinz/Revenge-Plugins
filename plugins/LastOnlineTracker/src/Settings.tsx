// --- Settings.tsx ---
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";
import { ReactNative } from "@vendetta/metro/common";

const { ScrollView, View } = ReactNative;

export default function Settings() {
    useProxy(storage);

    return (
        <ScrollView>
            <View>
                <Forms.FormSwitchRow
                    label="Show Last Online on DM Header"
                    value={storage.dmTopBar ?? true}
                    onValueChange={v => storage.dmTopBar = v}
                />
                <Forms.FormSwitchRow
                    label="Show Last Online in Member/DM List"
                    value={storage.userList ?? true}
                    onValueChange={v => storage.userList = v}
                />
                <Forms.FormSwitchRow
                    label="Show Last Online on User Profiles"
                    value={storage.profileUsername ?? true}
                    onValueChange={v => storage.profileUsername = v}
                />
            </View>
        </ScrollView>
    );
}
