import { NextRequest, NextResponse } from "next/server";

const NX_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://localhost:7001/rest/v3";

// Disable SSL verification for localhost development
const fetchOptions: RequestInit = {
  headers: {
    "Content-Type": "application/json",
  },
};

// For Node.js environments, disable SSL verification for localhost
if (typeof process !== "undefined" && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export async function GET(request: NextRequest) {
  return handleRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return handleRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return handleRequest(request, "PUT");
}

export async function PATCH(request: NextRequest) {
  return handleRequest(request, "PATCH");
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request, "DELETE");
}

async function handleRequest(request: NextRequest, method: string) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace("/api/nx", "");
    const searchParams = url.searchParams.toString();

    const targetUrl = `${NX_BASE_URL}${pathname}${searchParams ? `?${searchParams}` : ""}`;

    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    // Add body for POST/PUT/PATCH requests
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const body = await request.text();
      if (body) {
        requestOptions.body = body;
      }
    }

    // Forward cookies from the client request
    const cookies = request.headers.get("cookie");
    if (cookies) {
      requestOptions.headers = {
        ...requestOptions.headers,
        Cookie: cookies,
      };
    }

    // Make request to Nx Witness server
    const response = await fetch(targetUrl, requestOptions);

    // Get response data
    const contentType = response.headers.get("content-type");
    let data;

    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Create response with CORS headers
    const nextResponse = new NextResponse(typeof data === "string" ? data : JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": contentType || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    });

    // Forward set-cookie headers
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    setCookieHeaders.forEach((cookie) => {
      nextResponse.headers.append("Set-Cookie", cookie);
    });

    return nextResponse;
  } catch (error) {
    console.error("[API Proxy] Error:", error);
    return NextResponse.json(
      { error: "Proxy request failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
