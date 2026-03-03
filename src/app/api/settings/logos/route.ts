import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LOGO_DIR = path.join(process.cwd(), "data", "logos");

// Ensure directory exists
if (!fs.existsSync(LOGO_DIR)) {
    fs.mkdirSync(LOGO_DIR, { recursive: true });
}

export async function GET(request: NextRequest) {
    try {
        const files = fs.readdirSync(LOGO_DIR);
        const logos = files.map(file => ({
            name: file,
            url: `/api/settings/logos/${file}`,
            path: path.join(LOGO_DIR, file)
        }));
        return NextResponse.json(logos);
    } catch (error) {
        console.error("Error listing logos:", error);
        return NextResponse.json({ error: "Failed to list logos" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const filePath = path.join(LOGO_DIR, fileName);

        fs.writeFileSync(filePath, buffer);

        return NextResponse.json({
            success: true,
            name: fileName,
            url: `/api/settings/logos/${fileName}`
        });
    } catch (error) {
        console.error("Error uploading logo:", error);
        return NextResponse.json({ error: "Failed to upload logo" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get("name");

        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const filePath = path.join(LOGO_DIR, name);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Safety check to prevent directory traversal
        if (!filePath.startsWith(LOGO_DIR)) {
            return NextResponse.json({ error: "Invalid path" }, { status: 400 });
        }

        fs.unlinkSync(filePath);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting logo:", error);
        return NextResponse.json({ error: "Failed to delete logo" }, { status: 500 });
    }
}
