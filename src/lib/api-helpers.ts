import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import connectDB from '@/lib/db';
import User from '@/models/User';

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

// Tiny in-memory TTL cache for the live `isActive` / role lookup so we don't hit
// the DB on every authenticated request. Cache TTL is small enough that a deactivation
// or role change propagates within seconds.
const userStatusCache = new Map<string, { active: boolean; role: UserRole; expires: number }>();
const USER_STATUS_TTL = 30_000; // 30s

async function loadUserStatus(userId: string): Promise<{ active: boolean; role: UserRole } | null> {
  const cached = userStatusCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return { active: cached.active, role: cached.role };
  }
  if (!isValidObjectId(userId)) return null;
  const u = await User.findById(userId).select('isActive role').lean();
  if (!u) return null;
  userStatusCache.set(userId, {
    active: !!(u as any).isActive,
    role: (u as any).role,
    expires: Date.now() + USER_STATUS_TTL,
  });
  return { active: !!(u as any).isActive, role: (u as any).role };
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

      // Live status check: reject deactivated users and users whose role changed
      // (or no longer exists) even if they still hold a valid JWT.
      const status = await loadUserStatus(user.id);
      if (!status) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (!status.active) {
        return NextResponse.json(
          { error: 'الحساب غير مفعل' },
          { status: 403 }
        );
      }
      // Trust the DB role, not the (potentially stale) JWT role.
      user.role = status.role;

      if (allowedRoles && !allowedRoles.includes(user.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      return await handler(req, user);
    } catch (error: any) {
      console.error('API Error:', error);
      // Never leak internal error messages or stack traces to clients.
      // Detailed info stays in the server log; the client gets a generic message.
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

// Rate limiting (in-memory).
// WARNING: This is per-process only. On multi-instance / serverless deployments
// each instance has its own counter, so the effective cap is maxRequests × instances.
// Replace with a Redis-backed store (e.g. ioredis + sliding-window) for production.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Periodically purge expired entries to prevent unbounded memory growth.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap) {
      if (now > record.resetTime) rateLimitMap.delete(key);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

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

// Escape a string for safe use inside a MongoDB $regex query.
// Prevents NoSQL regex injection and catastrophic backtracking via attacker-controlled patterns.
export function escapeRegex(input: string): string {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Validate a MongoDB ObjectId string. Returns true only for well-formed 24-hex ObjectIds.
// Mongoose's isValidObjectId accepts 12-byte strings & numbers — too permissive.
import mongoose from 'mongoose';
export function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id) && mongoose.isValidObjectId(id);
}
