// Force ignore SSL errors globally for the local proxy
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, getDynamicConfig } from "@/lib/config";
import {
  cacheGetJson,
  cacheSetJson,
  nxProxyGetCacheKey,
  overwriteNxProxyGetCache,
} from "@/lib/redis/cache";
import {
  isCacheableNxEndpoint,
  isDeviceMutationEndpoint,
  isDevicesListEndpoint,
} from "@/lib/redis/nx-cache-policy";
import { markDevicesCachesStale, syncDevicesFromListResponse } from "@/lib/nx-devices-store";

interface CacheEntry {
    data: string;
    headers: Record<string, string>;
    status: number;
}

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

        const authContext = headers['authorization'] || '';
        const runtimeGuid = request.headers.get('x-runtime-guid') || '';
        const redisGetKey = nxProxyGetCacheKey(targetUrl, authContext, runtimeGuid);

        if (isCacheableNxEndpoint(path, method)) {
            const cached = await cacheGetJson<CacheEntry>(redisGetKey);
            if (cached) {
                console.log(`[NX Proxy Cache] HIT: ${method} ${path}`);
                return new NextResponse(cached.data, {
                    status: cached.status,
                    headers: cached.headers,
                });
            }
            console.log(`[NX Proxy Cache] MISS: ${method} ${path}`);
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
            
            if (response.ok && isCacheableNxEndpoint(path, method)) {
                const entry = { data: text, headers: responseHeaders, status };
                await cacheSetJson(redisGetKey, entry);
                const nxSystemKey = `${nxLocationIp}:${nxLocationPort}`;
                if (isDevicesListEndpoint(path)) {
                    try {
                        await syncDevicesFromListResponse(nxSystemKey, JSON.parse(text));
                    } catch {
                        /* ignore parse errors for device index */
                    }
                }
                console.log(`[NX Proxy Cache] Cached metadata response for ${path} (${text.length} bytes)`);
            } else if (
                response.ok &&
                ["POST", "PUT", "PATCH", "DELETE"].includes(method)
            ) {
                const nxSystemKey = `${nxLocationIp}:${nxLocationPort}`;
                if (isDeviceMutationEndpoint(path, method)) {
                    await markDevicesCachesStale(nxSystemKey);
                }
                await overwriteNxProxyGetCache(targetUrl, authContext, runtimeGuid, {
                    data: text,
                    headers: responseHeaders,
                    status,
                });
                console.log(`[NX Proxy Cache] Overwrote GET cache after ${method} ${path}`);
            }

            return new NextResponse(text, {
                status: status,
                headers: responseHeaders,
            });
        }

        // Optimize binary transfers (video streams, large recordings) by piping stream directly
        // This avoids buffering potentially gigabytes of binary media in server RAM
        return new NextResponse(response.body, {
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

