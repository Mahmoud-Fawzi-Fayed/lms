import { describe, it, expect, beforeEach } from 'vitest';
import { makeUser, makeCourse } from './factories';
import { setCurrentUser, clearCurrentUser, mockRequest } from './auth-mock';

async function coursesApi() {
  return import('@/app/api/courses/route');
}

describe('Courses listing — academic-year scoping & publish gating', () => {
  let instA: any;
  let stuSec1: any;
  let stuPrim4: any;
  let cPrimary: any;
  let cSec1: any;
  let cSec1Unpub: any;
  let cSec2: any;

  beforeEach(async () => {
    instA = await makeUser({ role: 'instructor', name: 'Mr X' });
    stuSec1 = await makeUser({ role: 'student', academicYear: 'grade1_secondary' });
    stuPrim4 = await makeUser({ role: 'student', academicYear: 'grade4_primary' });

    cPrimary = await makeCourse({
      instructor: instA._id, title: 'Primary4',
      isPublished: true, targetYear: 'grade4_primary', level: 'beginner', price: 0,
    });
    cSec1 = await makeCourse({
      instructor: instA._id, title: 'Sec1A',
      isPublished: true, targetYear: 'grade1_secondary', level: 'intermediate', price: 100,
    });
    cSec1Unpub = await makeCourse({
      instructor: instA._id, title: 'Sec1Hidden',
      isPublished: false, targetYear: 'grade1_secondary', level: 'advanced', price: 100,
    });
    cSec2 = await makeCourse({
      instructor: instA._id, title: 'Sec2',
      isPublished: true, targetYear: 'grade2_secondary', level: 'advanced', price: 200,
    });
  });

  it('anonymous request sees ALL published courses (no targetYear filter)', async () => {
    clearCurrentUser();
    const { GET } = await coursesApi();
    const res = await GET(mockRequest('/api/courses'));
    const json = await res.json();
    expect(json.success).toBe(true);
    const titles = json.data.courses.map((c: any) => c.title).sort();
    expect(titles).toEqual(['Primary4', 'Sec1A', 'Sec2']);
  });

  it('student sees ONLY published courses for their academic year', async () => {
    setCurrentUser({ id: String(stuSec1._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await coursesApi();
    const res = await GET(mockRequest('/api/courses'));
    const json = await res.json();
    expect(json.success).toBe(true);
    const titles = json.data.courses.map((c: any) => c.title);
    expect(titles).toEqual(['Sec1A']);
  });

  it('student without academicYear gets requiresAcademicYear flag', async () => {
    const stuNoYear = await makeUser({ role: 'student' });
    setCurrentUser({ id: String(stuNoYear._id), role: 'student' });
    const { GET } = await coursesApi();
    const res = await GET(mockRequest('/api/courses'));
    const json = await res.json();
    expect(json.data.requiresAcademicYear).toBe(true);
    expect(json.data.courses).toHaveLength(0);
  });

  it('respects level filter on top of year scoping', async () => {
    setCurrentUser({ id: String(stuPrim4._id), role: 'student', academicYear: 'grade4_primary' });
    const { GET } = await coursesApi();
    const res = await GET(mockRequest('/api/courses?level=intermediate'));
    const json = await res.json();
    expect(json.data.courses).toHaveLength(0); // primary4 student has only beginner course
  });

  it('does not leak unpublished course in the secondary student response', async () => {
    setCurrentUser({ id: String(stuSec1._id), role: 'student', academicYear: 'grade1_secondary' });
    const { GET } = await coursesApi();
    const res = await GET(mockRequest('/api/courses'));
    const json = await res.json();
    const titles = json.data.courses.map((c: any) => c.title);
    expect(titles).not.toContain('Sec1Hidden');
  });
});
