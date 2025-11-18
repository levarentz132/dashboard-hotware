import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'API Proxy is running',
    timestamp: new Date().toISOString(),
    proxyPath: '/api/nx',
    message: 'Ready to proxy requests to Nx Witness server'
  })
}