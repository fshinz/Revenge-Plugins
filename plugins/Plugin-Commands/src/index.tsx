import { registerCommand } from "@vendetta/commands";
import {
    installPlugin,
    removePlugin,
    plugins,
    getSettings,
} from "@vendetta/plugins";
import { findByProps, findByName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { React } from "@vendetta/metro/common";

let unregisterCommands: Array<() => void> = [];

// Resolve Navigation modules matching the working modal implementation
const Navigation = findByProps("push", "pushLazy", "pop");
const Navigator =
    findByName("Navigator") ?? findByProps("Navigator")?.Navigator;
const modalCloseButton =
    findByProps("getRenderCloseButton")?.getRenderCloseButton ??
    findByProps("getHeaderCloseButton")?.getHeaderCloseButton;

// Helper to find plugin ID by matching input string against URL or Manifest Name
function findPluginId(query: string): string | null {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return null;

    for (const id of Object.keys(plugins)) {
        const plugin = plugins[id] as any;
        const manifest = plugin?.manifest;

        if (!manifest) continue;

        const name = manifest.name?.toLowerCase();
        const url = manifest.vendetta?.url?.toLowerCase();

        if (
            id.toLowerCase() === normalizedQuery ||
            name === normalizedQuery ||
            url === normalizedQuery
        ) {
            return id;
        }

        if (
            name?.includes(normalizedQuery) ||
            url?.includes(normalizedQuery)
        ) {
            return id;
        }
    }

    return null;
}

// Opens the plugin settings page using the working Modal implementation
function openPluginSettings(pluginId: string) {
    const plugin = plugins[pluginId] as any;

    if (!plugin) {
        showToast("Error: Plugin object not found in store", undefined);
        return;
    }

    try {
        if (!Navigation || !Navigator) {
            showToast(
                "Error: Navigation stack modules not found",
                undefined
            );
            return;
        }

        const title = plugin.manifest?.name || "Plugin Settings";

        // Push using pure React.createElement to prevent React element/JSX bundle mismatch
        Navigation.push(() =>
            React.createElement(Navigator, {
                initialRouteName: "PluginSettingsModal",
                screens: {
                    PluginSettingsModal: {
                        title: title,

                        headerLeft: modalCloseButton?.(() => {
                            if (typeof Navigation?.pop === "function") {
                                Navigation.pop();
                            }
                        }),

                        render: () => {
                            try {
                                return React.createElement(SettingsComponent);
                            } catch (renderErr: any) {
                                console.error(
                                    "[PluginCommands] Render error inside settings:",
                                    renderErr
                                );

                                showToast(
                                    `Render error: ${
                                        renderErr?.message || renderErr
                                    }`,
                                    undefined
                                );

                                return null;
                            }
                        },
                    },
                },
            })
        );
    } catch (err: any) {
        console.error(
            "[PluginCommands] Exception caught in openPluginSettings:",
            err
        );

        showToast(
            `Fatal: ${err?.message || String(err)}`,
            undefined
        );
    }
}

export default {
    onLoad: () => {
        // 1. /plugin-install [url]
        unregisterCommands.push(
            registerCommand({
                name: "plugin-install",
                displayName: "plugin-install",
                description:
                    "Install a client plugin directly from a manifest URL",

                options: [
                    {
                        name: "url",
                        displayName: "url",
                        description:
                            "Direct manifest link or repository URL",
                        type: 3,
                        required: true,
                    },
                ],

                execute: async (args) => {
                    const url = args[0]?.value?.trim();

                    if (!url) return;

                    try {
                        showToast("Installing plugin...", undefined);

                        await installPlugin(url);

                        showToast(
                            "Plugin installed successfully!",
                            undefined
                        );
                    } catch (err: any) {
                        showToast(
                            `Failed: ${err?.message || err}`,
                            undefined
                        );
                    }
                },
            })
        );

        // 2. /plugin-uninstall [plugin]
        unregisterCommands.push(
            registerCommand({
                name: "plugin-uninstall",
                displayName: "plugin-uninstall",
                description:
                    "Uninstall an installed plugin by name or URL",

                options: [
                    {
                        name: "plugin",
                        displayName: "plugin",
                        description: "Plugin Name or URL",
                        type: 3,
                        required: true,
                    },
                ],

                execute: async (args) => {
                    const query = args[0]?.value?.trim();

                    if (!query) return;

                    const targetId = findPluginId(query);

                    if (!targetId) {
                        showToast(
                            "Plugin not found in installed list",
                            undefined
                        );
                        return;
                    }

                    try {
                        await removePlugin(targetId);

                        showToast(
                            "Plugin uninstalled",
                            undefined
                        );
                    } catch (err: any) {
                        showToast(
                            `Failed to uninstall: ${
                                err?.message || err
                            }`,
                            undefined
                        );
                    }
                },
            })
        );

        // 3. /plugin-settings [plugin]
        unregisterCommands.push(
            registerCommand({
                name: "plugin-settings",
                displayName: "plugin-settings",
                description:
                    "Open settings for an installed plugin",

                options: [
                    {
                        name: "plugin",
                        displayName: "plugin",
                        description: "Plugin Name or URL",
                        type: 3,
                        required: true,
                    },
                ],

                execute: (args) => {
                    const query = args[0]?.value?.trim();

                    if (!query) return;

                    const targetId = findPluginId(query);

                    if (!targetId) {
                        showToast(
                            "No installed plugin matched that name/URL",
                            undefined
                        );
                        return;
                    }

                    openPluginSettings(targetId);
                },
            })
        );
    },

    onUnload: () => {
        unregisterCommands.forEach((unreg) => unreg());
        unregisterCommands = [];
    },
};