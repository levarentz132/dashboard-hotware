import { NextRequest, NextResponse } from "next/server";
import {
  readNotifications,
  writeNotifications,
  type StoredNotification,
} from "@/lib/notifications-store";

function normalizeUsername(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.username === "string" && parsed.username.trim()) {
        return parsed.username.trim();
      }
      if (typeof parsed.email === "string" && parsed.email.trim()) {
        return parsed.email.trim();
      }
    }
  } catch {
    // Ignore and fall back to the raw string.
  }

  return trimmed;
}

function getLegacyNotificationKeys(
  allNotifications: Record<string, StoredNotification[]>,
  username: string,
) {
  return Object.keys(allNotifications).filter((key) => {
    if (key === username) return true;

    try {
      const parsed = JSON.parse(key);
      return (
        parsed &&
        typeof parsed === "object" &&
        ((parsed.username && parsed.username === username) ||
          (parsed.email && parsed.email === username))
      );
    } catch {
      return false;
    }
  });
}

function mergeLegacyBuckets(
  allNotifications: Record<string, StoredNotification[]>,
  username: string,
) {
  const legacyKeys = getLegacyNotificationKeys(allNotifications, username);
  if (legacyKeys.length === 0) {
    return allNotifications;
  }

  const merged = legacyKeys.flatMap((key) => allNotifications[key] || []);
  const existing = allNotifications[username] || [];

  const uniqueById = new Map<string, StoredNotification>();
  for (const notification of [...merged, ...existing]) {
    uniqueById.set(notification.id, notification);
  }

  const combined = Array.from(uniqueById.values()).sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
  );

  allNotifications[username] = combined;

  for (const key of legacyKeys) {
    if (key !== username) {
      delete allNotifications[key];
    }
  }

  return allNotifications;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUsername = searchParams.get("username");
    const username = normalizeUsername(rawUsername);

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const allNotifications = await readNotifications();
    mergeLegacyBuckets(allNotifications, username);
    const userNotifications = allNotifications[username] || [];

    await writeNotifications(allNotifications);

    return NextResponse.json({ notifications: userNotifications });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      username,
      type,
      title,
      message,
      systemId,
      deviceId,
      startTimeMs,
      endTimeMs,
      durationMs,
      timestamp,
    } = body;
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !type || !title || !message) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    const allNotifications = await readNotifications();
    mergeLegacyBuckets(allNotifications, normalizedUsername);
    if (!allNotifications[normalizedUsername]) {
      allNotifications[normalizedUsername] = [];
    }

    const newNotification: StoredNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      title,
      message,
      systemId,
      deviceId,
      startTimeMs,
      endTimeMs,
      durationMs,
      timestamp: timestamp || Date.now(),
      read: false,
    };

    allNotifications[normalizedUsername].unshift(newNotification);

    if (allNotifications[normalizedUsername].length > 50) {
      allNotifications[normalizedUsername] = allNotifications[normalizedUsername].slice(0, 50);
    }

    await writeNotifications(allNotifications);

    return NextResponse.json({ success: true, notification: newNotification });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUsername = searchParams.get("username");
    const username = normalizeUsername(rawUsername);
    const notificationId = searchParams.get("id");
    const clearAll = searchParams.get("clearAll") === "true";

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const allNotifications = await readNotifications();
    mergeLegacyBuckets(allNotifications, username);
    if (!allNotifications[username]) {
      return NextResponse.json({ success: true });
    }

    if (clearAll) {
      allNotifications[username] = [];
    } else if (notificationId) {
      allNotifications[username] = allNotifications[username].filter(
        (n) => n.id !== notificationId,
      );
    }

    await writeNotifications(allNotifications);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, id, read } = body;
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !id) {
      return NextResponse.json({ error: "Username and ID are required" }, { status: 400 });
    }

    const allNotifications = await readNotifications();
    mergeLegacyBuckets(allNotifications, normalizedUsername);
    if (allNotifications[normalizedUsername]) {
      const notif = allNotifications[normalizedUsername].find((n) => n.id === id);
      if (notif) {
        notif.read = read !== undefined ? read : true;
        await writeNotifications(allNotifications);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
