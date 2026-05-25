// Comprehensive API Test Script
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3003';
const MONGO_URI = 'mongodb://localhost:27017/lms_0xray';

let passed = 0, failed = 0;
const failures = [];

async function api(method, path, body, cookie) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (cookie) opts.headers['Cookie'] = cookie;
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

function test(name, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push({ name, detail });
  }
}

// ===== Setup: create users directly in DB =====
async function setupDB() {
  console.log('\n🔧 Setting up test data in MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Drop all test data
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    await db.collection(col.name).deleteMany({});
  }

  const salt = await bcrypt.genSalt(12);
  const hashedPwd = await bcrypt.hash('Test1234!', salt);

  // Create admin
  const adminResult = await db.collection('users').insertOne({
    name: 'مسؤول النظام',
    email: 'admin@test.com',
    password: hashedPwd,
    phone: '01012345678',
    role: 'admin',
    isActive: true,
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create instructor
  const instrResult = await db.collection('users').insertOne({
    name: 'محمد المدرس',
    email: 'instructor@test.com',
    password: hashedPwd,
    phone: '01098765432',
    role: 'instructor',
    isActive: true,
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create student
  const studentResult = await db.collection('users').insertOne({
    name: 'أحمد الطالب',
    email: 'student@test.com',
    password: hashedPwd,
    phone: '01055555555',
    role: 'student',
    isActive: true,
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('  Users created: admin, instructor, student');
  return {
    adminId: adminResult.insertedId,
    instructorId: instrResult.insertedId,
    studentId: studentResult.insertedId,
  };
}

// ===== Get NextAuth session cookie =====
async function login(email, password) {
  // Get CSRF token first
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() || [];

  const cookieHeader = csrfCookies.map(c => c.split(';')[0]).join('; ');

  // Login via NextAuth credentials
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      json: 'true',
    }),
    redirect: 'manual',
  });

  // Collect all cookies
  const allCookies = loginRes.headers.getSetCookie?.() || [];
  const merged = [...csrfCookies, ...allCookies].map(c => c.split(';')[0]).join('; ');
  return merged;
}

// ===== Main test flow =====
async function main() {
  const { adminId, instructorId, studentId } = await setupDB();
  await mongoose.disconnect();

  console.log('\n🔑 Testing Authentication...');

  // Test login
  const adminCookie = await login('admin@test.com', 'Test1234!');
  test('Admin login', adminCookie.includes('next-auth.session-token'), adminCookie);

  const instrCookie = await login('instructor@test.com', 'Test1234!');
  test('Instructor login', instrCookie.includes('next-auth.session-token'), instrCookie);

  const studentCookie = await login('student@test.com', 'Test1234!');
  test('Student login', studentCookie.includes('next-auth.session-token'), studentCookie);

  // Test /api/users/me
  console.log('\n👤 Testing User Profile API...');
  const meRes = await api('GET', '/api/users/me', null, studentCookie);
  test('GET /api/users/me returns user', meRes.status === 200 && meRes.json?.data?.name, `status=${meRes.status} json=${JSON.stringify(meRes.json).slice(0,200)}`);

  const mePatchRes = await api('PUT', '/api/users/me', { name: 'أحمد محمد' }, studentCookie);
  test('PUT /api/users/me updates name', mePatchRes.status === 200, `status=${mePatchRes.status} json=${JSON.stringify(mePatchRes.json).slice(0,200)}`);

  // Test unauthenticated access
  const unauthRes = await api('GET', '/api/users/me');
  test('Unauth /api/users/me returns 401', unauthRes.status === 401, `status=${unauthRes.status}`);

  // ===== Course CRUD =====
  console.log('\n📚 Testing Course APIs...');

  // Create course as instructor
  const courseData = {
    title: 'دورة اختبارية في البرمجة',
    description: 'هذه دورة اختبارية لتعلم أساسيات البرمجة بلغة جافاسكريبت وهي دورة شاملة ومفصلة.',
    shortDescription: 'دورة البرمجة الأساسية',
    price: 299,
    category: 'programming',
    level: 'beginner',
    language: 'ar',
    tags: ['javascript', 'برمجة'],
    requirements: ['حاسوب', 'انترنت'],
    whatYouLearn: ['أساسيات JS', 'DOM', 'APIs'],
  };

  const createCourseRes = await api('POST', '/api/courses', courseData, instrCookie);
  test('POST /api/courses creates course', createCourseRes.status === 201 && createCourseRes.json?.data?._id, `status=${createCourseRes.status} json=${JSON.stringify(createCourseRes.json).slice(0,300)}`);

  const courseId = createCourseRes.json?.data?._id;

  if (courseId) {
    // Get course by ID (use instructor cookie because course is not yet published)
    const getCourseRes = await api('GET', `/api/courses/${courseId}`, null, instrCookie);
    test('GET /api/courses/:id returns course', getCourseRes.status === 200 && getCourseRes.json?.data, `status=${getCourseRes.status} json=${JSON.stringify(getCourseRes.json).slice(0,200)}`);

    // Update course
    const updateRes = await api('PUT', `/api/courses/${courseId}`, { title: 'دورة محدثة', price: 199 }, instrCookie);
    test('PUT /api/courses/:id updates course', updateRes.status === 200, `status=${updateRes.status} json=${JSON.stringify(updateRes.json).slice(0,200)}`);

    // List courses
    const listRes = await api('GET', '/api/courses');
    test('GET /api/courses lists courses', listRes.status === 200 && listRes.json?.data?.courses?.length >= 0, `status=${listRes.status}`);

    // Student cannot create course
    const forbiddenRes = await api('POST', '/api/courses', courseData, studentCookie);
    test('Student cannot create course (403)', forbiddenRes.status === 403, `status=${forbiddenRes.status}`);
  } else {
    console.log('  ⚠️  Skipping course tests — create failed');
  }

  // ===== Enrollment =====
  console.log('\n📝 Testing Enrollment APIs...');
  if (courseId) {
    // Publish course and use payments/initiate (free path) to enroll
    await api('PUT', `/api/courses/${courseId}`, { isPublished: true, price: 0 }, instrCookie);
    const enrollRes = await api('POST', '/api/payments/initiate', { courseId, method: 'card' }, studentCookie);
    test('POST /api/payments/initiate enrolls (free)', enrollRes.status === 200 && enrollRes.json?.data?.enrolled, `status=${enrollRes.status} json=${JSON.stringify(enrollRes.json).slice(0,200)}`);

    const enrollListRes = await api('GET', '/api/enrollments', null, studentCookie);
    test('GET /api/enrollments lists enrollments', enrollListRes.status === 200, `status=${enrollListRes.status} json=${JSON.stringify(enrollListRes.json).slice(0,200)}`);
  }

  // ===== Exams =====
  console.log('\n📝 Testing Exam APIs...');
  const examData = {
    title: 'اختبار البرمجة الأول',
    description: 'اختبار شامل في أساسيات البرمجة',
    course: courseId,
    duration: 30,
    passingScore: 60,
    maxAttempts: 3,
    isPublished: true,
    questions: [
      {
        type: 'mcq',
        text: 'ما هي لغة البرمجة الأكثر استخداماً في الويب؟',
        options: [
          { text: 'JavaScript', isCorrect: true },
          { text: 'Python', isCorrect: false },
          { text: 'Java', isCorrect: false },
          { text: 'C++', isCorrect: false },
        ],
        points: 10,
        order: 0,
      },
      {
        type: 'truefalse',
        text: 'HTML هي لغة برمجة',
        options: [
          { text: 'صح', isCorrect: false },
          { text: 'خطأ', isCorrect: true },
        ],
        points: 10,
        order: 1,
      },
    ],
  };

  const createExamRes = await api('POST', '/api/exams', examData, instrCookie);
  test('POST /api/exams creates exam', createExamRes.status === 201 || createExamRes.status === 200, `status=${createExamRes.status} json=${JSON.stringify(createExamRes.json).slice(0,300)}`);

  const examId = createExamRes.json?.data?._id;

  if (examId) {
    // Get exam
    const getExamRes = await api('GET', `/api/exams/${examId}`, null, studentCookie);
    test('GET /api/exams/:id returns exam', getExamRes.status === 200, `status=${getExamRes.status} json=${JSON.stringify(getExamRes.json).slice(0,200)}`);

    // Start exam
    const startRes = await api('POST', `/api/exams/${examId}/start`, {}, studentCookie);
    test('POST /api/exams/:id/start starts attempt', startRes.status === 201 || startRes.status === 200, `status=${startRes.status} json=${JSON.stringify(startRes.json).slice(0,200)}`);

    const attemptId = startRes.json?.data?.attempt?._id;
    const startedQs  = startRes.json?.data?.exam?.questions || [];

    if (attemptId && startedQs.length) {
      // Submit using server-provided question ids
      const submitData = {
        examId,
        attemptId,
        answers: startedQs.map(q => ({ questionId: q._id, selectedOption: q.options?.[0]?._id || q.options?.[0]?.text })),
      };
      const submitRes = await api('POST', '/api/exams/submit', submitData, studentCookie);
      test('POST /api/exams/submit submits answers', submitRes.status === 200, `status=${submitRes.status} json=${JSON.stringify(submitRes.json).slice(0,300)}`);

      // Leaderboard (auth required)
      const lbRes = await api('GET', `/api/exams/${examId}/leaderboard`, null, studentCookie);
      test('GET /api/exams/:id/leaderboard works', lbRes.status === 200, `status=${lbRes.status} json=${JSON.stringify(lbRes.json).slice(0,200)}`);
    } else {
      console.log('  ⚠️  Skipping submit test — start failed');
    }

    // Update exam
    const updateExamRes = await api('PUT', `/api/exams/${examId}`, { title: 'اختبار محدث' }, instrCookie);
    test('PUT /api/exams/:id updates exam', updateExamRes.status === 200, `status=${updateExamRes.status} json=${JSON.stringify(updateExamRes.json).slice(0,200)}`);
  } else {
    console.log('  ⚠️  Skipping exam tests — create failed');
  }

  // ===== Admin APIs =====
  console.log('\n🔧 Testing Admin APIs...');
  const adminStatsRes = await api('GET', '/api/admin/stats', null, adminCookie);
  test('GET /api/admin/stats returns stats', adminStatsRes.status === 200 && adminStatsRes.json?.data, `status=${adminStatsRes.status} json=${JSON.stringify(adminStatsRes.json).slice(0,300)}`);

  const adminUsersRes = await api('GET', '/api/admin/users', null, adminCookie);
  test('GET /api/admin/users returns users', adminUsersRes.status === 200, `status=${adminUsersRes.status} json=${JSON.stringify(adminUsersRes.json).slice(0,300)}`);

  // Admin update user role
  const roleUpdateRes = await api('PUT', '/api/admin/users', { userId: instructorId.toString(), role: 'instructor' }, adminCookie);
  test('PUT /api/admin/users updates role', roleUpdateRes.status === 200, `status=${roleUpdateRes.status} json=${JSON.stringify(roleUpdateRes.json).slice(0,200)}`);

  // Non-admin access denied
  const instrAdminRes = await api('GET', '/api/admin/stats', null, instrCookie);
  test('Instructor cannot access admin stats (403)', instrAdminRes.status === 403, `status=${instrAdminRes.status}`);

  // ===== Instructor Stats =====
  console.log('\n📊 Testing Instructor Stats...');
  const instrStatsRes = await api('GET', '/api/instructor/stats', null, instrCookie);
  test('GET /api/instructor/stats returns stats', instrStatsRes.status === 200, `status=${instrStatsRes.status} json=${JSON.stringify(instrStatsRes.json).slice(0,300)}`);

  // ===== Payment API =====
  console.log('\n💳 Testing Payment API...');
  if (courseId) {
    const payRes = await api('POST', '/api/payments/initiate', { courseId, method: 'card' }, studentCookie);
    // Expect failure due to missing Paymob config, but should not be 500
    test('POST /api/payments/initiate handles request', payRes.status !== 500 || payRes.json?.error, `status=${payRes.status} json=${JSON.stringify(payRes.json).slice(0,200)}`);
  }

  // ===== Content Token =====
  console.log('\n🔐 Testing Content Token API...');
  if (courseId) {
    // content-token is a GET that needs a real lessonId; with fake id we expect 400/404
    const tokenRes = await api('GET', `/api/courses/${courseId}/content-token?lessonId=test123`, null, studentCookie);
    test('GET /api/courses/:id/content-token (fake lesson)', [200, 400, 403, 404].includes(tokenRes.status), `status=${tokenRes.status} json=${JSON.stringify(tokenRes.json).slice(0,200)}`);
  }

  // ===== Registration validation =====
  console.log('\n🔒 Testing Validation...');
  const badRegRes = await api('POST', '/api/auth/register', { name: 'A', email: 'bad', password: '123' });
  test('Invalid registration rejected', badRegRes.status === 400 || badRegRes.status === 429, `status=${badRegRes.status} json=${JSON.stringify(badRegRes.json).slice(0,200)}`);

  // ===== Frontend Page Compilation =====
  console.log('\n🌐 Testing Frontend Pages...');
  const pages = [
    '/', '/login', '/register', '/courses',
    '/dashboard', '/dashboard/admin', '/dashboard/instructor',
    '/dashboard/student', '/dashboard/student/courses',
    '/dashboard/student/exams', '/dashboard/student/profile',
    '/dashboard/admin/users', '/dashboard/admin/courses',
    '/dashboard/admin/payments', '/dashboard/instructor/courses',
    '/dashboard/instructor/courses/new', '/dashboard/instructor/exams',
  ];

  for (const page of pages) {
    const res = await fetch(`${BASE}${page}`, { redirect: 'manual' });
    const ok = res.status === 200 || res.status === 307 || res.status === 302;
    test(`Page ${page} — ${res.status}`, ok, `status=${res.status}`);
  }

  // ===== Summary =====
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    failures.forEach(f => console.log(`  - ${f.name}: ${f.detail || ''}`));
  }
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});
