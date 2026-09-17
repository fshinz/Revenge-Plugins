// --- LastOnlineText.tsx ---
import React, { useState, useEffect } from "react";
import { findByStoreName } from "@vendetta/metro";
import { ReactNative, FluxDispatcher } from "@vendetta/metro/common";

const { Text, View } = ReactNative;
const PresenceStore = findByStoreName("PresenceStore");

// In-memory timestamp store updated via Gateway events
const lastSeenCache = new Map<string, number>();

// Listen to presence events directly to prevent continuous re-rendering
FluxDispatcher.subscribe("PRESENCE_UPDATES", (data: any) => {
    for (const update of data.updates ?? []) {
        if (update.status === "offline") {
            lastSeenCache.set(update.user.id, Date.now());
        }
    }
});

function formatLastSeen(timestamp: number | undefined): string {
    if (!timestamp) return "Offline";
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function LastOnlineText({ userId }: { userId: string }) {
    const presence = PresenceStore.getState()?.clientStatuses?.[userId];
    const isOnline = Boolean(presence && Object.keys(presence).length > 0);

    const [formattedTime, setFormattedTime] = useState<string>(() => 
        isOnline ? "Online" : formatLastSeen(lastSeenCache.get(userId))
    );

    useEffect(() => {
        if (isOnline) {
            setFormattedTime("Online");
            return;
        }

        const updateTime = () => {
            setFormattedTime(formatLastSeen(lastSeenCache.get(userId)));
        };

        updateTime();
        const interval = setInterval(updateTime, 30000); // Low-overhead 30s tick
        return () => clearInterval(interval);
    }, [userId, isOnline]);

    return (
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 4 }}>
            <Text style={{ fontSize: 12, color: isOnline ? "#23a55a" : "#80848e" }}>
                {formattedTime}
            </Text>
        </View>
    );
}
