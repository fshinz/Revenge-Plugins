// --- index.tsx ---
import { patcher } from "@vendetta";
import { findByName, findByProps, findByTypeName, findByTypeNameAll } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { findInReactTree } from "@vendetta/utils";
import React from "react";
import Settings from "./Settings";
import LastOnlineText from "./LastOnlineText";

let unpatches = [];

export default {
    onLoad: () => {
        storage.dmTopBar ??= true;
        storage.userList ??= true;
        storage.profileUsername ??= true;
        storage.lastOnlineData ??= {};

        // 1. Safe DM Header Injection
        const HeaderModule = findByProps("Header") || findByName("Header", false);
        if (HeaderModule) {
            const funcKey = HeaderModule.Header ? "Header" : (HeaderModule.default ? "default" : null);
            if (funcKey) {
                unpatches.push(patcher.after(funcKey, HeaderModule, (_, res) => {
                    if (!storage.dmTopBar) return;

                    const userId = findInReactTree(res, c => c?.props?.user?.id)?.props?.user?.id;
                    if (!userId) return;

                    const titleContainer = findInReactTree(res, c => c?.props?.children && Array.isArray(c.props.children));
                    if (titleContainer && !findInReactTree(res, c => c?.key === "LastOnline-DMHeader")) {
                        titleContainer.props.children.push(
                            <LastOnlineText key="LastOnline-DMHeader" userId={userId} />
                        );
                    }
                }));
            }
        }

        const ChannelHeaderModule = findByProps("ChannelHeader") || findByName("ChannelHeader", false);
        if (ChannelHeaderModule) {
            const funcKey = ChannelHeaderModule.ChannelHeader ? "ChannelHeader" : (ChannelHeaderModule.default ? "default" : null);
            if (funcKey) {
                unpatches.push(patcher.after(funcKey, ChannelHeaderModule, (_, res) => {
                    if (!storage.dmTopBar) return;
                    const userId = findInReactTree(res, m => m?.props?.user?.id)?.props?.user?.id;
                    if (!userId) return;

                    const targetNode = findInReactTree(res, c => Array.isArray(c?.props?.children));
                    if (targetNode && !findInReactTree(res, c => c?.key === "LastOnline-DMHeader")) {
                        targetNode.props.children.push(
                            <LastOnlineText key="LastOnline-DMHeader" userId={userId} />
                        );
                    }
                }));
            }
        }

        // 2. Profile Screen Injection
        const UserProfileContent = findByTypeName("UserProfileContent");
        if (UserProfileContent) {
            unpatches.push(patcher.after("type", UserProfileContent, (_, res) => {
                if (!storage.profileUsername) return;
                let primaryInfo = findInReactTree(res, c => c?.type?.name === "PrimaryInfo");
                if (!primaryInfo) return;
                
                patcher.after("type", primaryInfo, (_, primaryRes) => {
                    if (primaryRes?.type?.name === "UserProfilePrimaryInfo") {
                        patcher.after("type", primaryRes, (_, primaryInnerRes) => {
                            let displayName = findInReactTree(primaryInnerRes, c => c?.type?.name === "DisplayName");
                            if (!displayName) return;
                            patcher.after("type", displayName, (args, displayRes) => {
                                const userId = args[0]?.user?.id;
                                if (userId && !findInReactTree(displayRes, c => c?.key === "LastOnline-Profile")) {
                                    displayRes.props.children.push(
                                        <LastOnlineText key="LastOnline-Profile" userId={userId} />
                                    );
                                }
                            });
                        });
                    }
                });
            }));
        }

        // 3. Member List & DM List Injection (Tabs V2 / UserRow)
        const rowPatch = ([{ user }], res) => {
            if (!storage.userList || !user?.id) return;

            const existing = findInReactTree(res?.props?.label, c => c?.key === "LastOnline-UserRow");
            if (!existing && res?.props) {
                const originalLabel = res.props.label;
                res.props.label = (
                    <React.Fragment key="LastOnline-UserRow">
                        {originalLabel}
                        <LastOnlineText userId={user.id} />
                    </React.Fragment>
                );
            }
        };

        findByTypeNameAll("UserRow").forEach(UserRow => {
            unpatches.push(patcher.after("type", UserRow, rowPatch));
        });

        // 4. Fallback Guild Member Row (Old Layouts)
        const Rows = findByProps("GuildMemberRow");
        if (Rows?.GuildMemberRow) {
            unpatches.push(patcher.after("type", Rows.GuildMemberRow, ([{ user }], res) => {
                if (!storage.userList || !user?.id) return;
                const targetRow = findInReactTree(res, c => c?.props?.style?.flexDirection === "row");
                if (targetRow && !findInReactTree(res, c => c?.key === "LastOnline-GuildRow")) {
                    targetRow.props.children.push(
                        <LastOnlineText key="LastOnline-GuildRow" userId={user.id} />
                    );
                }
            }));
        }
    },

    onUnload: () => {
        unpatches.forEach(u => u());
        unpatches = [];
    },

    settings: Settings
};
