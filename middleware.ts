import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes that require authentication
const protectedPaths = ['/dashboard', '/courses', '/exams', '/api/user'];
// Routes that require specific roles
const adminPaths = ['/dashboard/admin'];
const instructorPaths = ['/dashboard/instructor'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get JWT token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Redirect authenticated users away from auth pages
  if (token && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Check protected routes
  const isProtected = protectedPaths.some(path => pathname.startsWith(path));
  if (isProtected && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check admin routes
  if (pathname.startsWith('/dashboard/admin') && token?.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Check instructor routes
  if (
    pathname.startsWith('/dashboard/instructor') &&
    token?.role !== 'instructor' &&
    token?.role !== 'admin'
  ) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Security headers for content routes
  const response = NextResponse.next();

  // Prevent embedding in iframes (clickjacking protection)
  response.headers.set('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/courses/learn/:path*',
    '/exams/take/:path*',
    '/login',
    '/register',
    '/api/user/:path*',
  ],
};
