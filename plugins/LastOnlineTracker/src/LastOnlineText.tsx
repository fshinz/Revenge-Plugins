// --- LastOnlineText.tsx ---
import React, { useState, useEffect } from "react";
import { ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const { Text } = ReactNative;

function formatTimestamp(timestamp, format) {
    if (!timestamp) return null;
    const date = new Date(timestamp);

    if (format === "exact") {
        return date.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    // Relative Time
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return "Just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

export default function LastSeenText({ userId, style }) {
    useProxy(storage);
    
    // Safely retrieve timestamp from persistent storage
    const timestamp = storage.lastOnlineData?.[userId];
    const [timeStr, setTimeStr] = useState(() => formatTimestamp(timestamp, storage.timeFormat));

    useEffect(() => {
        const updateText = () => {
            const currentTimestamp = storage.lastOnlineData?.[userId];
            setTimeStr(formatTimestamp(currentTimestamp, storage.timeFormat));
        };

        updateText();
        const interval = setInterval(updateText, 30000);

        return () => clearInterval(interval);
    }, [userId, storage.timeFormat, storage.lastOnlineData?.[userId]]);

    if (!timeStr) return null;

    return (
        <Text style={[{ color: "#949ba4" }, style]}>
            Last seen: {timeStr}
        </Text>
    );
}
