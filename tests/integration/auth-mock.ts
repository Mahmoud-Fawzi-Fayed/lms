// Helper used by integration test files.
// The actual vi.mock('next-auth/jwt') is registered in tests/integration/setup.ts
// so it's installed before route handlers import it.

import { NextRequest } from 'next/server';

export function setCurrentUser(opts: {
  id: string;
  email?: string;
  name?: string;
  role: 'admin' | 'instructor' | 'student';
  academicYear?: string;
} | null) {
  if (!opts) {
    globalThis.__INTEGRATION_AUTH__.user = null;
    return;
  }
  globalThis.__INTEGRATION_AUTH__.user = {
    id: opts.id,
    email: opts.email ?? `${opts.id}@test.io`,
    name: opts.name ?? 'Test',
    role: opts.role,
    academicYear: opts.academicYear,
  };
}

export function clearCurrentUser() {
  globalThis.__INTEGRATION_AUTH__.user = null;
}

export function mockRequest(url: string, init?: { method?: string; body?: any }): NextRequest {
  const method = init?.method ?? 'GET';
  const reqInit: any = { method };
  if (init?.body !== undefined) {
    reqInit.body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    reqInit.headers = { 'content-type': 'application/json' };
  }
  return new NextRequest(new URL(url, 'http://localhost'), reqInit);
}

export async function readJson(res: Response): Promise<any> {
  return res.json();
}
