// Integration test setup — boots an in-memory MongoDB and connects mongoose to it.
// Setup files run BEFORE test-file imports are evaluated, so this guarantees that
// when src/lib/db.ts captures `process.env.MONGODB_URI` at module load,
// it sees the in-memory URI rather than a placeholder.

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Module-scoped mutable auth state. Tests update via setCurrentUser() in auth-mock.ts.
// Exposed via globalThis so the auth-mock.ts file and this setup share one cell.
declare global {
  // eslint-disable-next-line no-var
  var __INTEGRATION_AUTH__: {
    user: null | { id: string; email: string; name: string; role: string; academicYear?: string };
  };
}
globalThis.__INTEGRATION_AUTH__ = { user: null };

// Stub next-auth/jwt so withAuth() can pull the currently-set test user from
// JWT-style cookies without any real signing.
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(async () => {
    const u = globalThis.__INTEGRATION_AUTH__.user;
    if (!u) return null;
    return u as any;
  }),
}));

let mongod: MongoMemoryServer;

// Top-level await: vitest evaluates setupFiles before test code, so by the time
// any route handler imports src/lib/db.ts, MONGODB_URI is already correct.
mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri();
process.env.NEXTAUTH_SECRET = 'integration-test-secret';
process.env.CONTENT_SECRET = 'a'.repeat(64);

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
});

afterEach(async () => {
  // Wipe all collections between tests for full isolation.
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
