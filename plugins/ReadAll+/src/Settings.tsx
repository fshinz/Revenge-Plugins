import { storage } from "@vendetta/plugin";
import { findByStoreName, findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";

const { ScrollView } = ReactNative;
const FormIcon = findByProps("FormIcon")?.FormIcon || Forms.FormIcon;

interface ExceptionSettings {
  excludedServers: string[];
  excludedDMs: string[];
}

const DEFAULT_SETTINGS: ExceptionSettings = {
  excludedServers: [],
  excludedDMs: []
};

// --- Storage Utilities ---
export const getSettings = (): ExceptionSettings => ({ ...DEFAULT_SETTINGS, ...storage });
export const saveSettings = (settings: ExceptionSettings): void => { Object.assign(storage, settings); };

export const addServerException = (serverId: string): boolean => {
  const settings = getSettings();
  if (!settings.excludedServers.includes(serverId)) {
    settings.excludedServers.push(serverId);
    saveSettings(settings);
    return true;
  }
  return false;
};

export const removeServerException = (serverId: string): boolean => {
  const settings = getSettings();
  const index = settings.excludedServers.indexOf(serverId);
  if (index > -1) {
    settings.excludedServers.splice(index, 1);
    saveSettings(settings);
    return true;
  }
  return false;
};

export const addDMException = (channelId: string): boolean => {
  const settings = getSettings();
  if (!settings.excludedDMs.includes(channelId)) {
    settings.excludedDMs.push(channelId);
    saveSettings(settings);
    return true;
  }
  return false;
};

export const removeDMException = (channelId: string): boolean => {
  const settings = getSettings();
  const index = settings.excludedDMs.indexOf(channelId);
  if (index > -1) {
    settings.excludedDMs.splice(index, 1);
    saveSettings(settings);
    return true;
  }
  return false;
};

export const isServerExcluded = (serverId: string): boolean => getSettings().excludedServers.includes(serverId);
export const isDMExcluded = (channelId: string): boolean => getSettings().excludedDMs.includes(channelId);

export const getServerName = (serverId: string): string => {
  try {
    const guild = findByStoreName("GuildStore")?.getGuild?.(serverId);
    return guild?.name || `Server: ${serverId}`;
  } catch (e) {
    return `Server: ${serverId}`;
  }
};

export const getDMName = (channelId: string): string => {
  try {
    const channel = findByStoreName("ChannelStore")?.getChannel?.(channelId);
    if (channel?.name) return channel.name;
    if (channel?.recipients?.[0]) {
      const user = findByStoreName("UserStore")?.getUser?.(channel.recipients[0]);
      return user?.username ? `@${user.username}` : `DM: ${channelId}`;
    }
    return `DM: ${channelId}`;
  } catch (e) {
    return `DM: ${channelId}`;
  }
};

export const clearAllExceptions = (): void => {
  saveSettings({ excludedServers: [], excludedDMs: [] });
};

export const getAllExceptions = () => {
  const settings = getSettings();
  return {
    servers: settings.excludedServers.map(id => ({ id, name: getServerName(id) })),
    dms: settings.excludedDMs.map(id => ({ id, name: getDMName(id) }))
  };
};

// --- Settings Component UI ---
export default function Settings() {
  const [serverInput, setServerInput] = React.useState("");
  const [dmInput, setDMInput] = React.useState("");
  const [exceptions, setExceptions] = React.useState(getAllExceptions());

  const refresh = () => setExceptions(getAllExceptions());

  const handleAddServer = () => {
    if (!serverInput.trim()) return;
    if (addServerException(serverInput.trim())) {
      showToast("Added server exception", getAssetIDByName("ic_check"));
      setServerInput("");
      refresh();
    } else {
      showToast("Server already excluded", getAssetIDByName("ic_close_16px"));
    }
  };

  const handleAddDM = () => {
    if (!dmInput.trim()) return;
    if (addDMException(dmInput.trim())) {
      showToast("Added DM exception", getAssetIDByName("ic_check"));
      setDMInput("");
      refresh();
    } else {
      showToast("DM already excluded", getAssetIDByName("ic_close_16px"));
    }
  };

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 8 }}>
      {/* SERVER EXCEPTIONS */}
      <Forms.FormSection title="Server Exceptions">
        <Forms.FormInput
          placeholder="Enter Server ID"
          value={serverInput}
          onChange={setServerInput}
          onSubmitEditing={handleAddServer}
        />
        <Forms.FormRow
          label="Add Server ID"
          leading={<FormIcon source={getAssetIDByName("ic_add_24px")} />}
          onPress={handleAddServer}
        />
        {exceptions.servers.map((server) => (
          <Forms.FormRow
            key={server.id}
            label={server.name}
            subLabel={server.id}
            leading={<FormIcon source={getAssetIDByName("ic_server_card")} />}
            trailing={
              <Forms.FormRow
                leading={<FormIcon source={getAssetIDByName("ic_trash_24px")} style={{ tintColor: "#ff4757" }} />}
                onPress={() => {
                  removeServerException(server.id);
                  showToast("Removed server", getAssetIDByName("ic_check"));
                  refresh();
                }}
              />
            }
          />
        ))}
      </Forms.FormSection>

      <Forms.FormDivider />

      {/* DM EXCEPTIONS */}
      <Forms.FormSection title="DM / Group Exceptions">
        <Forms.FormInput
          placeholder="Enter Channel ID"
          value={dmInput}
          onChange={setDMInput}
          onSubmitEditing={handleAddDM}
        />
        <Forms.FormRow
          label="Add DM ID"
          leading={<FormIcon source={getAssetIDByName("ic_add_24px")} />}
          onPress={handleAddDM}
        />
        {exceptions.dms.map((dm) => (
          <Forms.FormRow
            key={dm.id}
            label={dm.name}
            subLabel={dm.id}
            leading={<FormIcon source={getAssetIDByName("ic_dm")} />}
            trailing={
              <Forms.FormRow
                leading={<FormIcon source={getAssetIDByName("ic_trash_24px")} style={{ tintColor: "#ff4757" }} />}
                onPress={() => {
                  removeDMException(dm.id);
                  showToast("Removed DM", getAssetIDByName("ic_check"));
                  refresh();
                }}
              />
            }
          />
        ))}
      </Forms.FormSection>

      <Forms.FormDivider />

      {/* DANGEROUS / CLEAR ACTIONS */}
      <Forms.FormSection title="Actions">
        <Forms.FormRow
          label="Clear All Exceptions"
          leading={<FormIcon source={getAssetIDByName("ic_trash_24px")} style={{ tintColor: "#ff4757" }} />}
          onPress={() => {
            clearAllExceptions();
            showToast("Cleared all exceptions", getAssetIDByName("ic_check"));
            refresh();
          }}
        />
      </Forms.FormSection>
    </ScrollView>
  );
}
