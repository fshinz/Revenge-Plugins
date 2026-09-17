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
        
        // Ensure persistent storage object exists on startup
        storage.lastOnlineData ??= {};

        // 1. DM Header Injection
        const ChannelHeader = findByName("ChannelHeader", false);
        if (ChannelHeader) {
            unpatches.push(patcher.after("default", ChannelHeader, (_, res) => {
                if (!storage.dmTopBar || res?.type?.type?.name !== "PrivateChannelHeader") return;

                patcher.after("type", res.type, (_, headerRes) => {
                    const userId = findInReactTree(headerRes, m => m?.props?.user?.id)?.props?.user?.id;
                    if (!userId) return;

                    const titleComp = headerRes?.props?.children?.props?.children?.[1];
                    if (titleComp && typeof titleComp.type === "function") {
                        const unpatchTitle = patcher.after("type", titleComp, (_, titleRes) => {
                            unpatchTitle();
                            if (!findInReactTree(titleRes, c => c?.key === "LastOnline-DMHeader")) {
                                titleRes.props.children[0].props.children.push(
                                    <LastOnlineText key="LastOnline-DMHeader" userId={userId} />
                                );
                            }
                        });
                    }
                });
            }));
        }

        // 2. Profile Screen Injection
        const UserProfileContent = findByTypeName("UserProfileContent");
        if (UserProfileContent) {
            unpatches.push(patcher.after("type", UserProfileContent, (_, res) => {
                if (!storage.profileUsername) return;
                let primaryInfo = findInReactTree(res, c => c?.type?.name === "PrimaryInfo");
                
                patcher.after("type", primaryInfo, (_, primaryRes) => {
                    if (primaryRes?.type?.name === "UserProfilePrimaryInfo") {
                        patcher.after("type", primaryRes, (_, primaryInnerRes) => {
                            let displayName = findInReactTree(primaryInnerRes, c => c?.type?.name === "DisplayName");
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
