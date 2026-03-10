import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, buildCloudHeaders  } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  // Quick auth check - if no cloud token exists, return 401 immediately
  const headers = buildCloudHeaders(request, 'all');
  if (!headers["Authorization"]) {
    return NextResponse.json(
      { error: "Please log in to NX Cloud", requiresAuth: true },
      { status: 401 }
    );
  }

  // Use the existing cloud API pattern that handles auth properly
  // systemId 'all' returns all systems the user has access to
  return fetchFromCloudApi(request, {
    systemId: 'all',
    endpoint: '/api/systems/',
    systemName: 'NX Cloud'
  });
}