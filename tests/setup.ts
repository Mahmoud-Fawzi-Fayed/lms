// Vitest global setup: provide harmless env defaults so modules that read
// environment at import-time (like src/lib/db.ts) don't throw during unit tests.
// Real DB / secret values are NOT used — we never call connectDB() in unit tests.
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/lms-test-unused';
process.env.NEXTAUTH_SECRET ||= 'test-nextauth-secret-not-used';
process.env.CONTENT_SECRET ||= 'a'.repeat(64);
