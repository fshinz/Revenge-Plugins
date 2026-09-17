import React, { useState, useEffect } from "react";
import { ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const { Text } = ReactNative;

function formatTimestamp(timestamp: number | undefined) {
    if (!timestamp) return null;

    const date = new Date(timestamp);
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);

    if (diffSeconds < 60) {
        return "Just now";
    }

    const diffMinutes = Math.floor(diffSeconds / 60);

    if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);

    if (diffDays < 7) {
        return `${diffDays}d ago`;
    }

    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

export default function LastOnlineText({
    userId,
    style
}: {
    userId: string;
    style?: any;
}) {
    useProxy(storage);

    const [timeStr, setTimeStr] = useState(() =>
        formatTimestamp(storage.lastOnlineData?.[userId])
    );

    useEffect(() => {
        const update = () => {
            setTimeStr(
                formatTimestamp(
                    storage.lastOnlineData?.[userId]
                )
            );
        };

        update();

        const interval = setInterval(update, 30000);

        return () => clearInterval(interval);
    }, [userId]);

    if (!timeStr) {
        return null;
    }

    return (
        <Text
            style={[
                {
                    color: "#949ba4"
                },
                style
            ]}
        >
            Last seen: {timeStr}
        </Text>
    );
}