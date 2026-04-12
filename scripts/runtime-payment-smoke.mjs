const BASE = 'http://localhost:3000';

async function api(method, path, body, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json };
}

async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfJson = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() || [];
  const cookieHeader = csrfCookies.map((c) => c.split(';')[0]).join('; ');

  const form = new URLSearchParams({
    csrfToken: csrfJson.csrfToken,
    email,
    password,
    json: 'true',
  });

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
    },
    body: form,
    redirect: 'manual',
  });

  const loginCookies = loginRes.headers.getSetCookie?.() || [];
  const cookie = [...csrfCookies, ...loginCookies]
    .map((c) => c.split(';')[0])
    .join('; ');

  if (!cookie.includes('next-auth.session-token') && !cookie.includes('__Secure-next-auth.session-token')) {
    throw new Error(`Login failed for ${email}`);
  }

  return cookie;
}

function assert(condition, label, details = '') {
  if (!condition) {
    throw new Error(`FAIL: ${label}${details ? ` | ${details}` : ''}`);
  }
  console.log(`PASS: ${label}`);
}

async function main() {
  const instructorCookie = await login('instructor@lms.com', 'Instructor1234');
  const studentCookie = await login('student.g4@lms.com', 'Student1234');

  const createCourse = await api('POST', '/api/courses', {
    title: 'Runtime Smoke Course',
    description: 'Runtime smoke test course long enough description for schema validation.',
    shortDescription: 'Runtime smoke',
    category: 'programming',
    level: 'beginner',
    language: 'ar',
    price: 500,
    discountPrice: 300,
    isPublished: true,
  }, instructorCookie);

  assert(createCourse.status === 201, 'Create paid course', JSON.stringify(createCourse.json));
  const courseId = createCourse.json?.data?._id;
  assert(!!courseId, 'Course id exists');

  const toFreeCourse = await api('PUT', `/api/courses/${courseId}`, {
    price: 0,
    discountPrice: 250,
    isPublished: true,
  }, instructorCookie);

  assert(toFreeCourse.status === 200, 'Switch course paid->free', JSON.stringify(toFreeCourse.json));
  assert((toFreeCourse.json?.data?.price ?? -1) === 0, 'Course price normalized to 0');
  assert(toFreeCourse.json?.data?.discountPrice == null, 'Course discount cleared when free');

  const courseEnroll = await api('POST', '/api/payments/initiate', {
    courseId,
    method: 'card',
  }, studentCookie);

  assert(courseEnroll.status === 200, 'Free course payment initiate returns 200', JSON.stringify(courseEnroll.json));
  assert(!!courseEnroll.json?.data?.enrolled, 'Free course auto-enrolls');

  const createExam = await api('POST', '/api/exams', {
    title: 'Runtime Smoke Standalone Exam',
    description: 'Standalone exam for runtime smoke tests',
    targetYear: 'grade4_primary',
    accessType: 'paid',
    price: 200,
    discountPrice: 120,
    duration: 20,
    passingScore: 60,
    maxAttempts: 2,
    questions: [
      {
        type: 'mcq',
        text: '2 + 2 = ?',
        options: [
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
        points: 1,
        order: 0,
      },
    ],
  }, instructorCookie);

  assert(createExam.status === 201, 'Create paid standalone exam', JSON.stringify(createExam.json));
  const examId = createExam.json?.data?._id;
  assert(!!examId, 'Exam id exists');

  const publishExam = await api('PUT', `/api/exams/${examId}`, { isPublished: true }, instructorCookie);
  assert(publishExam.status === 200, 'Publish exam', JSON.stringify(publishExam.json));

  const toFreeExam = await api('PUT', `/api/exams/${examId}`, {
    accessType: 'free',
    price: 200,
    discountPrice: 100,
    isPublished: true,
  }, instructorCookie);

  assert(toFreeExam.status === 200, 'Switch exam paid->free', JSON.stringify(toFreeExam.json));
  assert((toFreeExam.json?.data?.price ?? -1) === 0, 'Exam price normalized to 0');
  assert(toFreeExam.json?.data?.discountPrice == null, 'Exam discount cleared when free');
  assert(toFreeExam.json?.data?.accessType === 'free', 'Exam accessType normalized to free');

  const examList = await api('GET', '/api/exams', null, studentCookie);
  assert(examList.status === 200, 'List exams for student', JSON.stringify(examList.json));
  const listed = (examList.json?.data?.exams || []).find((e) => e._id === examId);
  assert(!!listed, 'Updated exam appears in list');
  assert((listed.finalPrice ?? 9999) === 0, 'Final price is 0 after free switch');
  assert(listed.canAccess === true, 'Student can access free standalone exam without payment');

  const examEnroll = await api('POST', '/api/payments/exams/initiate', {
    examId,
    method: 'card',
  }, studentCookie);

  assert(examEnroll.status === 200, 'Free exam payment initiate returns 200', JSON.stringify(examEnroll.json));
  assert(!!examEnroll.json?.data?.enrolled, 'Free exam auto-enrolls');

  const startAttempt = await api('POST', `/api/exams/${examId}/start`, {}, studentCookie);
  assert(startAttempt.status === 200, 'Start free exam attempt succeeds', JSON.stringify(startAttempt.json));

  console.log('\nAll runtime payment smoke checks passed.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
