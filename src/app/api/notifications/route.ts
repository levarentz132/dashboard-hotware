import { NextRequest, NextResponse } from "next/server";
import {
  readNotifications,
  writeNotifications,
  type StoredNotification,
} from "@/lib/notifications-store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const allNotifications = await readNotifications();
    const userNotifications = allNotifications[username] || [];

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

    if (!username || !type || !title || !message) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    const allNotifications = await readNotifications();
    if (!allNotifications[username]) {
      allNotifications[username] = [];
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

    allNotifications[username].unshift(newNotification);

    if (allNotifications[username].length > 50) {
      allNotifications[username] = allNotifications[username].slice(0, 50);
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
    const username = searchParams.get("username");
    const notificationId = searchParams.get("id");
    const clearAll = searchParams.get("clearAll") === "true";

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const allNotifications = await readNotifications();
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

    if (!username || !id) {
      return NextResponse.json({ error: "Username and ID are required" }, { status: 400 });
    }

    const allNotifications = await readNotifications();
    if (allNotifications[username]) {
      const notif = allNotifications[username].find((n) => n.id === id);
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
