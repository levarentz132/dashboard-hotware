import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, postToCloudApi, putToCloudApi, deleteFromCloudApi, validateSystemId } from "@/lib/cloud-api";

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
  const { systemId, systemName } = validateSystemId(request);
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/nx", "");

  // Most NX Witness REST v3 APIs require the /rest/v3 prefix.
  // We add it here if it's missing to ensure compatibility with cloud relay and local v3 API.
  const endpoint = path.startsWith("/rest/v3") ? path : `/rest/v3${path}`;

  // If no systemId, return error (local check has been removed)
  if (!systemId) {
    return NextResponse.json(
      { error: "System ID is required. Local system support has been disabled." },
      { status: 400 }
    );
  }

  // Clone query params but remove systemId and systemName to avoid cluttering the target URL
  const queryParams = new URLSearchParams(url.searchParams);
  queryParams.delete("systemId");
  queryParams.delete("systemName");

  if (["POST", "PUT", "PATCH"].includes(method)) {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty or non-JSON body is acceptable for some requests
    }

    const options = {
      systemId,
      systemName: systemName || undefined,
      endpoint,
      body,
    };

    if (method === "PUT" || method === "PATCH") {
      return putToCloudApi(request, options);
    }
    return postToCloudApi(request, options);
  }

  if (method === "DELETE") {
    return deleteFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint,
      queryParams: queryParams.size > 0 ? queryParams : undefined,
    });
  }

  return fetchFromCloudApi(request, {
    systemId,
    systemName: systemName || undefined,
    endpoint,
    queryParams: queryParams.size > 0 ? queryParams : undefined,
  });
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

