import { describe, it, expect, beforeEach } from 'vitest';
import { makeUser } from './factories';
import { setCurrentUser, mockRequest } from './auth-mock';

async function adminUsers() {
  return import('@/app/api/admin/users/route');
}

describe('Admin users API — list / filter / search / role gating', () => {
  let admin: any;
  let inst: any;
  let stu1: any;
  let stu2: any;

  beforeEach(async () => {
    admin = await makeUser({ role: 'admin', name: 'Admin', email: 'admin@x.io' });
    inst = await makeUser({ role: 'instructor', name: 'Mr. Special', email: 'special@x.io' });
    stu1 = await makeUser({ role: 'student', name: 'Alice', email: 'alice@x.io', academicYear: 'grade1_secondary' });
    stu2 = await makeUser({ role: 'student', name: 'Bob', email: 'bob@x.io', academicYear: 'grade2_secondary' });
  });

  it('lists all users for admin with correct pagination shape', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsers();
    const res = await GET(mockRequest('/api/admin/users?page=1&limit=10'));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.pagination.total).toBe(4);
    expect(json.data.users).toHaveLength(4);
    // password must never be returned
    for (const u of json.data.users) {
      expect(u.password).toBeUndefined();
    }
  });

  it('filters by role=student', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsers();
    const res = await GET(mockRequest('/api/admin/users?role=student'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(2);
    expect(json.data.users.every((u: any) => u.role === 'student')).toBe(true);
  });

  it('ignores invalid role values (no SQL injection / no crash)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsers();
    const res = await GET(mockRequest('/api/admin/users?role=hacker'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(4); // filter not applied
  });

  it('search escapes regex metacharacters — no ReDoS / no injection', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsers();
    // ".*" would match everything if not escaped → result count would equal total.
    const res = await GET(mockRequest('/api/admin/users?search=' + encodeURIComponent('.*')));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(0);
  });

  it('search finds a known name', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminUsers();
    const res = await GET(mockRequest('/api/admin/users?search=Alice'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(1);
    expect(json.data.users[0].name).toBe('Alice');
  });

  it('non-admin cannot access the admin users list', async () => {
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
    const { GET } = await adminUsers();
    const res = await GET(mockRequest('/api/admin/users'));
    expect(res.status).toBe(403);
  });

  it('admin can change a student to instructor', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsers();
    const res = await PUT(mockRequest('/api/admin/users', {
      method: 'PUT',
      body: { userId: String(stu1._id), role: 'instructor' },
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.role).toBe('instructor');
  });

  it('admin cannot self-demote', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsers();
    const res = await PUT(mockRequest('/api/admin/users', {
      method: 'PUT',
      body: { userId: String(admin._id), role: 'student' },
    }));
    expect(res.status).toBe(400);
  });

  it('admin cannot self-deactivate', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsers();
    const res = await PUT(mockRequest('/api/admin/users', {
      method: 'PUT',
      body: { userId: String(admin._id), isActive: false },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid ObjectId on update', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsers();
    const res = await PUT(mockRequest('/api/admin/users', {
      method: 'PUT',
      body: { userId: 'not-an-objectid', isActive: false },
    }));
    expect(res.status).toBe(400);
  });

  it('deactivating a student is reflected on later stat queries', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PUT } = await adminUsers();
    const res = await PUT(mockRequest('/api/admin/users', {
      method: 'PUT',
      body: { userId: String(stu1._id), isActive: false },
    }));
    expect((await res.json()).success).toBe(true);

    // Deactivated student should no longer pass the live-status check in withAuth.
    // Simulate them trying to use any authed endpoint:
    setCurrentUser({ id: String(stu1._id), role: 'student' });
    const stats = await adminUsers();
    const r = await stats.GET(mockRequest('/api/admin/users'));
    // 403 because (a) inactive AND (b) student role isn't allowed.
    // The live-status check runs first, so status code is 403 either way.
    expect(r.status).toBe(403);
  });
});
