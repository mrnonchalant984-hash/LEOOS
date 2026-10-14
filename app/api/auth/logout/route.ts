import { NextResponse } from 'next/server';

function clearAuthCookies(res: NextResponse) {
  res.cookies.set('leo_access_token', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  res.cookies.set('leo_refresh_token', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}

// The dashboard currently links to this endpoint with a normal browser GET.
// Redirect after clearing the same server-managed cookies used by POST logout.
export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL('/auth', request.url));
  return clearAuthCookies(res);
}

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
