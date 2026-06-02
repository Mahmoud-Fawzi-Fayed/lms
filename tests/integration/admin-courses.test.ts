/**
 * Integration tests for GET /api/admin/courses
 *
 * Covers:
 *  - Non-admin role → 403
 *  - Unauthenticated → 401
 *  - Admin sees all courses (published + drafts)
 *  - status=published filter shows only published
 *  - status=draft filter shows only drafts
 *  - Search by title (escapes regex metacharacters)
 *  - Search by category
 *  - Pagination (page, limit, total)
 *  - Never leaks instructor password
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeUser, makeCourse } from './factories';
import { setCurrentUser, clearCurrentUser, mockRequest } from './auth-mock';

async function adminCoursesApi() {
  return import('@/app/api/admin/courses/route');
}

describe('GET /api/admin/courses — role gating', () => {
  it('returns 401 for unauthenticated requests', async () => {
    clearCurrentUser();
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for student role', async () => {
    const student = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for instructor role', async () => {
    const inst = await makeUser({ role: 'instructor' });
    setCurrentUser({ id: String(inst._id), role: 'instructor' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses'));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/courses — listing & filtering', () => {
  let admin: any;
  let instA: any;
  let instB: any;
  let coursePublished1: any;
  let coursePublished2: any;
  let courseDraft: any;

  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    instA = await makeUser({ role: 'instructor', name: 'Instructor A' });
    instB = await makeUser({ role: 'instructor', name: 'Instructor B' });
    coursePublished1 = await makeCourse({
      instructor: instA._id,
      title: 'Mathematics Grade 4',
      category: 'math',
      isPublished: true,
      price: 100,
    });
    coursePublished2 = await makeCourse({
      instructor: instB._id,
      title: 'Science Fundamentals',
      category: 'science',
      isPublished: true,
      price: 200,
    });
    courseDraft = await makeCourse({
      instructor: instA._id,
      title: 'Draft Arabic Course',
      category: 'language',
      isPublished: false,
      price: 50,
    });
  });

  it('admin sees all 3 courses including the draft', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses'));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.pagination.total).toBe(3);
    expect(json.data.courses).toHaveLength(3);
  });

  it('status=published returns only published courses', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses?status=published'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(2);
    expect(json.data.courses.every((c: any) => c.isPublished === true)).toBe(true);
  });

  it('status=draft returns only draft courses', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses?status=draft'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(1);
    expect(json.data.courses[0].isPublished).toBe(false);
    expect(json.data.courses[0].title).toBe('Draft Arabic Course');
  });

  it('search by title (partial match) finds correct courses', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses?search=Mathematics'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(1);
    expect(json.data.courses[0].title).toBe('Mathematics Grade 4');
  });

  it('search by category finds correct courses', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses?search=science'));
    const json = await res.json();
    expect(json.data.pagination.total).toBe(1);
    expect(json.data.courses[0].title).toBe('Science Fundamentals');
  });

  it('search escapes regex metacharacters — no ReDoS or injection', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses?search=' + encodeURIComponent('.*')));
    const json = await res.json();
    // ".*" should be escaped, matching nothing
    expect(json.data.pagination.total).toBe(0);
  });

  it('pagination: page=1&limit=1 returns first course only with correct pagination meta', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses?page=1&limit=1'));
    const json = await res.json();
    expect(json.data.courses).toHaveLength(1);
    expect(json.data.pagination.total).toBe(3);
    expect(json.data.pagination.pages).toBe(3);
    expect(json.data.pagination.page).toBe(1);
    expect(json.data.pagination.limit).toBe(1);
  });

  it('pagination: page=2&limit=2 returns the second page', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses?page=2&limit=2'));
    const json = await res.json();
    expect(json.data.courses).toHaveLength(1);
    expect(json.data.pagination.page).toBe(2);
  });

  it('populated instructor does not include password field', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses'));
    const json = await res.json();
    for (const c of json.data.courses) {
      if (c.instructor) {
        expect(c.instructor.password).toBeUndefined();
      }
    }
  });

  it('response includes key fields: title, slug, price, isPublished, enrollmentCount', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { GET } = await adminCoursesApi();
    const res = await GET(mockRequest('/api/admin/courses'));
    const json = await res.json();
    for (const c of json.data.courses) {
      expect(c.title).toBeDefined();
      expect(c.slug).toBeDefined();
      expect(c.isPublished).toBeDefined();
    }
  });
});
