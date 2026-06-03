/**
 * Integration tests — PATCH /api/courses/[id]/lesson-settings
 *
 * Pentest/QA focus:
 *  - RBAC: only instructor (course owner) and admin can patch
 *  - Non-owner instructor → 403 (cross-tenant write blocked)
 *  - filePath / source-of-content fields MUST NOT be touched (the route uses
 *    a dot-notation $set targeting `videoControls` only)
 *  - Sparse-array doc-bloat: extreme moduleIndex / lessonIndex must be rejected
 *  - Allow-listed videoControls keys only — extra keys are dropped
 *  - All-non-boolean videoControls payload → 400 (no empty $set inflating doc)
 *  - Malformed body / missing fields → 400
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { makeUser, makeCourse } from './factories';
import { setCurrentUser, clearCurrentUser } from './auth-mock';
import { Course } from '@/models';

async function lessonApi() { return import('@/app/api/courses/[id]/lesson-settings/route'); }

function patchReq(courseId: string, body: any) {
  return new NextRequest(new URL(`http://localhost/api/courses/${courseId}/lesson-settings`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function makeCourseWithLesson(opts: { instructor: any; filePath?: string }) {
  return Course.create({
    title: 'CourseLS-' + Math.random(),
    slug:  'courseLS-' + Math.random().toString(36).slice(2, 10),
    description: 'description with at least the right length',
    instructor: opts.instructor,
    price: 0,
    category: 'general',
    level: 'beginner',
    language: 'ar',
    isPublished: true,
    modules: [
      {
        title: 'M0',
        order: 0,
        lessons: [
          {
            title: 'L0',
            type: 'video',
            order: 0,
            duration: 600,
            isPreview: false,
            filePath: opts.filePath ?? '/uploads/secret-video.mp4',
            videoControls: {
              allowSpeed: true, allowSkip: true, allowFullscreen: true,
              allowSeek: true,  allowVolume: true, forceFocus: false,
            },
          },
        ],
      },
    ],
  });
}

describe('PATCH /api/courses/[id]/lesson-settings', () => {
  let owner: any, otherInstr: any, admin: any, student: any, course: any;

  beforeEach(async () => {
    owner = await makeUser({ role: 'instructor' });
    otherInstr = await makeUser({ role: 'instructor' });
    admin = await makeUser({ role: 'admin' });
    student = await makeUser({ role: 'student' });
    course = await makeCourseWithLesson({ instructor: owner._id });
  });

  it('rejects unauthenticated', async () => {
    clearCurrentUser();
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0, videoControls: { allowSpeed: false },
    }));
    expect(res.status).toBe(401);
  });

  it('rejects students with 403 (RBAC)', async () => {
    setCurrentUser({ id: String(student._id), role: 'student' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0, videoControls: { allowSpeed: false },
    }));
    expect(res.status).toBe(403);
  });

  it('CRITICAL: a non-owner instructor cannot patch another instructor\'s course', async () => {
    setCurrentUser({ id: String(otherInstr._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0, videoControls: { allowSpeed: false },
    }));
    expect(res.status).toBe(403);
  });

  it('admin CAN patch any instructor\'s course (super-user)', async () => {
    setCurrentUser({ id: String(admin._id), role: 'admin' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0, videoControls: { allowSpeed: false },
    }));
    expect(res.status).toBe(200);
  });

  it('owner can patch — only the videoControls subdoc changes', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0,
      videoControls: { allowSpeed: false, allowSkip: false, forceFocus: true },
    }));
    expect(res.status).toBe(200);

    const reloaded: any = await Course.findById(course._id).lean();
    const lesson = reloaded.modules[0].lessons[0];
    expect(lesson.videoControls.allowSpeed).toBe(false);
    expect(lesson.videoControls.allowSkip).toBe(false);
    expect(lesson.videoControls.forceFocus).toBe(true);
  });

  it('CRITICAL: filePath is NEVER mutated by the patch (no path injection)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0,
      videoControls: { allowSpeed: false },
      // attacker tries to overwrite filePath via the same payload:
      filePath: '/uploads/attacker-controlled.mp4',
    }));
    // filePath has `select: false` so we must explicitly opt-in to read it.
    const reloaded: any = await Course
      .findById(course._id)
      .select('+modules.lessons.filePath')
      .lean();
    expect(reloaded.modules[0].lessons[0].filePath).toBe('/uploads/secret-video.mp4');
  });

  it('CRITICAL: out-of-bounds moduleIndex returns 404 (no sparse-array bloat)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 999_999, lessonIndex: 0,
      videoControls: { allowSpeed: true },
    }));
    expect(res.status).toBe(404);

    const reloaded: any = await Course.findById(course._id).lean();
    // modules array length unchanged (no sparse fill)
    expect(reloaded.modules.length).toBe(1);
  });

  it('CRITICAL: out-of-bounds lessonIndex returns 404', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 1_000_000,
      videoControls: { allowSpeed: true },
    }));
    expect(res.status).toBe(404);
  });

  it('rejects negative moduleIndex / lessonIndex', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: -1, lessonIndex: 0,
      videoControls: { allowSpeed: true },
    }));
    expect(res.status).toBe(400);
  });

  it('rejects non-integer moduleIndex', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0.5, lessonIndex: 0,
      videoControls: { allowSpeed: true },
    }));
    expect(res.status).toBe(400);
  });

  it('drops non-allow-listed videoControls keys', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0,
      videoControls: {
        allowSpeed: false,
        // attacker tries to inject schema-violating fields:
        evil: '<script>alert(1)</script>',
        $set: { foo: 'bar' },
        __proto__: { polluted: true },
      },
    }));
    expect(res.status).toBe(200);
    const reloaded: any = await Course.findById(course._id).lean();
    const vc = reloaded.modules[0].lessons[0].videoControls;
    expect(vc.evil).toBeUndefined();
    expect(vc.$set).toBeUndefined();
    expect(vc.polluted).toBeUndefined();
    expect(vc.allowSpeed).toBe(false);
  });

  it('drops non-boolean values from videoControls (only true/false accepted)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0,
      videoControls: { allowSpeed: 'yes', allowSkip: 1, allowSeek: false },
    }));
    expect(res.status).toBe(200);
    const reloaded: any = await Course.findById(course._id).lean();
    const vc = reloaded.modules[0].lessons[0].videoControls;
    // only the boolean false survived
    expect(vc.allowSeek).toBe(false);
  });

  it('rejects when no allow-listed keys remain after filtering (empty $set guard)', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), {
      moduleIndex: 0, lessonIndex: 0,
      videoControls: { evil: true, foo: false }, // none in allow-list
    }));
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const req = new NextRequest(new URL(`http://localhost/api/courses/${course._id}/lesson-settings`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    expect((await PATCH(req)).status).toBe(400);
  });

  it('rejects when required fields are missing', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const res = await PATCH(patchReq(String(course._id), { videoControls: { allowSpeed: false } }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent course', async () => {
    setCurrentUser({ id: String(owner._id), role: 'instructor' });
    const { PATCH } = await lessonApi();
    const ghost = '507f1f77bcf86cd799439011';
    const res = await PATCH(patchReq(ghost, {
      moduleIndex: 0, lessonIndex: 0, videoControls: { allowSpeed: false },
    }));
    expect(res.status).toBe(404);
  });
});
