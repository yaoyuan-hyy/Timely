import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowed = (process.env.MOBILE_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const crossOrigin = origin && origin !== request.nextUrl.origin;
  if (crossOrigin && !allowed.includes(origin)) return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403 });
  const response = request.method === 'OPTIONS' ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  if (crossOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return response;
}
export const config = { matcher: '/api/:path*' };
