import { NextResponse } from 'next/server';
import { API_CONFIG, getDynamicConfig } from '@/lib/config';

export async function GET() {
    const config = getDynamicConfig();
    return NextResponse.json({
        nodeEnv: process.env.NODE_ENV,
        cwd: process.cwd(),
        envServerHost: process.env.NEXT_PUBLIC_NX_SERVER_HOST,
        configServerHost: config?.NEXT_PUBLIC_NX_SERVER_HOST || null,
        apiConfigServerHost: API_CONFIG.serverHost || null,
        envServerPort: process.env.NEXT_PUBLIC_NX_SERVER_PORT,
        configServerPort: config?.NEXT_PUBLIC_NX_SERVER_PORT || null,
        apiConfigServerPort: API_CONFIG.serverPort || null,
        hasVmsUsername: !!(process.env.NEXT_PUBLIC_NX_USERNAME || config?.NEXT_PUBLIC_NX_USERNAME),
    });
}
