import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import connectDB from '@/lib/db';

type UserRole = 'admin' | 'instructor' | 'student';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  academicYear?: string;
}

// Get authenticated user from request
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return null;
  return {
    id: token.id as string,
    email: token.email as string,
    role: token.role as UserRole,
    name: token.name as string,
    academicYear: token.academicYear as string | undefined,
  };
}

// Role-based middleware wrapper for API routes
export function withAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<NextResponse>,
  allowedRoles?: UserRole[]
) {
  return async (req: NextRequest) => {
    try {
      await connectDB();
      const user = await getAuthUser(req);

      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (allowedRoles && !allowedRoles.includes(user.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      return await handler(req, user);
    } catch (error: any) {
      console.error('API Error:', error);
      return NextResponse.json(
        { error: error.message || 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

// Rate limiting (in-memory, use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(
  identifier: string,
  maxRequests = 100,
  windowMs = 15 * 60 * 1000
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

// API error response helper
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// API success response helper
export function apiSuccess(data: any, status = 200) {
  return NextResponse.json({ success: true, data }, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
