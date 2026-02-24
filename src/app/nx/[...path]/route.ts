// Force ignore SSL errors globally for the local proxy
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    return handleRequest(request, "GET");
}

export async function POST(request: NextRequest) {
    return handleRequest(request, "POST");
}

async function handleRequest(request: NextRequest, method: string) {
    const url = new URL(request.url);
    const nxIndex = url.pathname.indexOf('/nx/');
    let path = url.pathname.substring(nxIndex + 4);

    if (!path.startsWith('/')) {
        path = '/' + path;
    }

    const targetUrl = `https://localhost:7001${path}${url.search}`;

    try {
        console.log(`[NX Proxy] Proxying ${method} ${path} to ${targetUrl}`);
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Accept-Encoding': 'identity',
        };

        request.headers.forEach((value, key) => {
            const lowerKey = key.toLowerCase();
            if (!['host', 'connection', 'content-length', 'content-encoding', 'transfer-encoding', 'accept-encoding', 'cookie'].includes(lowerKey)) {
                headers[lowerKey] = value;
            }
        });

        const fetchOptions: RequestInit = {
            method,
            headers,
            cache: 'no-store'
        };

        if (["POST", "PUT", "PATCH"].includes(method)) {
            try {
                const text = await request.text();
                if (text) fetchOptions.body = text;
            } catch (e) {
                console.warn(`[NX Proxy] Could not read request body:`, e);
            }
        }

        const response = await fetch(targetUrl, fetchOptions);

        const contentType = response.headers.get("content-type");

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
                responseHeaders[key] = value;
            }
        });

        if (response.status === 304) {
            return new NextResponse(null, {
                status: 304,
                headers: responseHeaders,
            });
        }

        if (contentType && (contentType.includes("json") || contentType.includes("text"))) {
            const text = await response.text();
            return new NextResponse(text, {
                status: response.status,
                headers: responseHeaders,
            });
        }

        const data = await response.arrayBuffer();
        return new NextResponse(data, {
            status: response.status,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error(`[NX Proxy Error] Failed to fetch ${targetUrl}:`, error);
        return NextResponse.json(
            {
                success: false,
                error: "Proxy connection failed",
                message: error.message,
                code: error.code
            },
            { status: 502 }
        );
    }
}
