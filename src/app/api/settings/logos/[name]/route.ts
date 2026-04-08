import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LOGO_DIR = path.join(process.cwd(), "data", "logos");

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    try {
        const name = (await params).name;
        const filePath = path.join(LOGO_DIR, name);

        if (!fs.existsSync(filePath)) {
            return new NextResponse("Not Found", { status: 404 });
        }

        // Safety check
        if (!filePath.startsWith(LOGO_DIR)) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const fileBuffer = fs.readFileSync(filePath);
        const ext = path.extname(name).toLowerCase();

        let contentType = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
        else if (ext === ".svg") contentType = "image/svg+xml";
        else if (ext === ".webp") contentType = "image/webp";

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": contentType,
            },
        });
    } catch (error) {
        console.error("Error serving logo:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
