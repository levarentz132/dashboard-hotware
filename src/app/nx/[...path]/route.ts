// Force ignore SSL errors globally for the local proxy
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, getDynamicConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
    return handleRequest(request, "GET");
}

export async function POST(request: NextRequest) {
    return handleRequest(request, "POST");
}

export async function PATCH(request: NextRequest) {
    return handleRequest(request, "PATCH");
}

export async function PUT(request: NextRequest) {
    return handleRequest(request, "PUT");
}

export async function DELETE(request: NextRequest) {
    return handleRequest(request, "DELETE");
}

async function handleRequest(request: NextRequest, method: string) {
    const url = new URL(request.url);
    const nxIndex = url.pathname.indexOf('/nx/');
    let path = url.pathname.substring(nxIndex + 4);

    if (!path.startsWith('/')) {
        path = '/' + path;
    }

    const cookieIp = request.cookies.get("nx_location_ip")?.value;
    const nxLocationIp = cookieIp || (API_CONFIG.serverHost || "localhost");
    
    const cookiePort = request.cookies.get("nx_location_port")?.value;
    const nxLocationPort = cookiePort || (API_CONFIG.serverPort || "7001");
    
    const targetUrl = `https://${nxLocationIp}:${nxLocationPort}${path}${url.search}`;

    try {
        // Build headers for the request
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Accept-Encoding': 'identity',
        };
        
        let existingAuth: string | null = null;
        request.headers.forEach((value, key) => {
            const lowerKey = key.toLowerCase();
            if (!['host', 'connection', 'content-length', 'content-encoding', 'transfer-encoding', 'accept-encoding', 'cookie', 'if-none-match', 'if-modified-since'].includes(lowerKey)) {
                headers[lowerKey] = value;
                if (lowerKey === 'authorization') existingAuth = value;
            }
        });
        
        // Add shared Basic auth if no authorization is provided by the client
        if (!existingAuth) {
            const dynamicConfig = getDynamicConfig(request);
            const username = dynamicConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME;
            const password = dynamicConfig?.NEXT_PUBLIC_NX_PASSWORD || process.env.NEXT_PUBLIC_NX_PASSWORD;
            
            if (username && password) {
                const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
                headers['Authorization'] = basicAuth;
            }
        }

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

        let response = await fetch(targetUrl, fetchOptions);

        // Retry with Basic Auth if 401/403 and we didn't use it already or session token failed
        if (response.status === 401 || response.status === 403) {
            const dynamicConfig = getDynamicConfig(request);
            const username = dynamicConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME;
            const password = dynamicConfig?.NEXT_PUBLIC_NX_PASSWORD || process.env.NEXT_PUBLIC_NX_PASSWORD;
            
            if (username && password) {
                const basicAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
                if (headers['Authorization'] !== basicAuth) {
                    const retryHeaders: Record<string, string> = { ...headers, 'Authorization': basicAuth };
                    delete retryHeaders['x-runtime-guid'];
                    delete retryHeaders['x-nx-session'];
                    
                    response = await fetch(targetUrl, {
                        ...fetchOptions,
                        headers: retryHeaders
                    });
                }
            }
        }

        const contentType = response.headers.get("content-type");

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            const lowerKey = key.toLowerCase();
            // IMPORTANT: Never forward WWW-Authenticate to the browser as it triggers the native Sign In prompt
            if (!['content-encoding', 'transfer-encoding', 'www-authenticate'].includes(lowerKey)) {
                responseHeaders[key] = value;
            }
        });

        const status = response.status === 401 ? 403 : response.status;

        if (response.status === 304) {
            return new NextResponse(null, {
                status: 304,
                headers: responseHeaders,
            });
        }

        if (contentType && (contentType.includes("json") || contentType.includes("text"))) {
            const text = await response.text();
            return new NextResponse(text, {
                status: status,
                headers: responseHeaders,
            });
        }

        const data = await response.arrayBuffer();
        return new NextResponse(data, {
            status: status,
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
