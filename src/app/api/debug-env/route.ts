import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        hasVmsUsername: !!process.env.NEXT_PUBLIC_NX_USERNAME,
        hasCloudUsername: !!process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME,
        nodeEnv: process.env.NODE_ENV,
        cwd: process.cwd(),
    });
}
