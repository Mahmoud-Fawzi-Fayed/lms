import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const BASE = 'http://localhost:3000';
const MONGO_URI = 'mongodb://localhost:27017/lms_0xray';
let passed = 0, failed = 0;
const failures = [];

async function api(method, path, body, cookie) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (cookie) opts.headers['Cookie'] = cookie;
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}

function test(name, ok, detail) {
  if (ok) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name} — ${detail||''}`); failed++; failures.push({name,detail}); }
}

async function setupDB() {
  console.log('\n🔧 Setting up test data...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  for (const c of await db.listCollections().toArray()) await db.collection(c.name).deleteMany({});
  const hash = await bcrypt.hash('Test1234!', await bcrypt.genSalt(12));
  const mkUser = (name,email,role) => db.collection('users').insertOne({
    name,email,password:hash,phone:'0101234',role,isActive:true,isEmailVerified:true,createdAt:new Date(),updatedAt:new Date()
  });
  const a = await mkUser('مسؤول','admin@test.com','admin');
  const i = await mkUser('مدرس','instructor@test.com','instructor');
  const s = await mkUser('طالب','student@test.com','student');
  console.log('  ✅ Users created');
  return { adminId:a.insertedId, instrId:i.insertedId, studentId:s.insertedId };
}

async function login(email) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cc = csrfRes.headers.getSetCookie?.() || [];
  const ch = cc.map(c=>c.split(';')[0]).join('; ');
  const lr = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':ch},
    body: new URLSearchParams({csrfToken,email,password:'Test1234!',json:'true'}), redirect:'manual',
  });
  const ac = lr.headers.getSetCookie?.() || [];
  return [...cc,...ac].map(c=>c.split(';')[0]).join('; ');
}

async function main() {
  const { adminId, instrId, studentId } = await setupDB();
  await mongoose.disconnect();

  console.log('\n🔑 Auth...');
  const ac = await login('admin@test.com'); test('Admin login', ac.includes('session-token'));
  const ic = await login('instructor@test.com'); test('Instructor login', ic.includes('session-token'));
  const sc = await login('student@test.com'); test('Student login', sc.includes('session-token'));

  console.log('\n👤 Profile...');
  let r = await api('GET','/api/users/me',null,sc);
  test('GET /api/users/me', r.status===200&&r.json?.data?.name, `${r.status}`);
  r = await api('PUT','/api/users/me',{name:'أحمد محمد'},sc);
  test('PUT /api/users/me', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,100)}`);
  r = await api('GET','/api/users/me');
  test('Unauth→401', r.status===401);

  console.log('\n📚 Courses...');
  r = await api('POST','/api/courses',{
    title:'دورة اختبارية في البرمجة',
    description:'هذه دورة اختبارية لتعلم أساسيات البرمجة بلغة جافاسكريبت وهي شاملة ومفصلة',
    price:299,category:'programming',level:'beginner',language:'ar',
    tags:['js'],requirements:['حاسوب'],whatYouLearn:['أساسيات JS'],
  },ic);
  test('Create paid course', r.status===201, `${r.status} ${JSON.stringify(r.json).slice(0,300)}`);
  const cid = r.json?.data?._id;

  r = await api('POST','/api/courses',{
    title:'دورة مجانية للمبتدئين',
    description:'دورة مجانية شاملة ومفصلة لتعلم البرمجة من الصفر بدون اي تكاليف',
    price:0,category:'programming',level:'beginner',
  },ic);
  test('Create free course', r.status===201, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
  const fcid = r.json?.data?._id;

  if(cid) {
    r = await api('GET',`/api/courses/${cid}`);
    test('GET course by id', r.status===200, `${r.status}`);
    r = await api('PUT',`/api/courses/${cid}`,{title:'دورة محدثة',price:199},ic);
    test('PUT course', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
    r = await api('GET','/api/courses');
    test('List courses', r.status===200&&Array.isArray(r.json?.data?.courses), `${r.status}`);
    r = await api('POST','/api/courses',{title:'t',description:'long enough desc',price:0,category:'x',level:'beginner'},sc);
    test('Student blocked (403)', r.status===403, `${r.status}`);
  }

  console.log('\n📝 Enrollment...');
  if(fcid) {
    await api('PUT',`/api/courses/${fcid}`,{isPublished:true},ic);
    r = await api('POST','/api/payments/initiate',{courseId:fcid,method:'card'},sc);
    test('Free enroll', r.status===200&&r.json?.data?.enrolled, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
    r = await api('GET','/api/enrollments',null,sc);
    test('List enrollments', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
  }

  console.log('\n📝 Exams...');
  const ecid = fcid||cid;
  r = await api('POST','/api/exams',{
    title:'اختبار البرمجة',description:'اختبار شامل',course:ecid,
    duration:30,passingScore:60,maxAttempts:3,
    questions:[
      {type:'mcq',text:'ما لغة الويب الأشهر؟',options:[
        {text:'JavaScript',isCorrect:true},{text:'Python',isCorrect:false},
        {text:'Java',isCorrect:false},{text:'C++',isCorrect:false},
      ],points:10,order:0},
      {type:'truefalse',text:'HTML ليست لغة برمجة',options:[
        {text:'صح',isCorrect:true},{text:'خطأ',isCorrect:false},
      ],points:10,order:1},
    ],
  },ic);
  test('Create exam', r.status===201, `${r.status} ${JSON.stringify(r.json).slice(0,300)}`);
  const eid = r.json?.data?._id;

  if(eid) {
    r = await api('PUT',`/api/exams/${eid}`,{isPublished:true},ic);
    test('Publish exam', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
    r = await api('GET',`/api/exams/${eid}`,null,sc);
    test('GET exam', r.status===200, `${r.status}`);
    r = await api('POST',`/api/exams/${eid}/start`,{},sc);
    test('Start attempt', r.status===200||r.status===201, `${r.status} ${JSON.stringify(r.json).slice(0,300)}`);
    const aid = r.json?.data?.attempt?._id;
    const qs = r.json?.data?.exam?.questions||[];
    if(aid&&qs.length) {
      r = await api('POST','/api/exams/submit',{
        examId:eid,attemptId:aid,
        answers:qs.map(q=>({questionId:q._id,selectedOption:q.options?.[0]?._id||q.options?.[0]?.text})),
      },sc);
      test('Submit exam', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,300)}`);
      r = await api('GET',`/api/exams/${eid}/leaderboard`);
      test('Leaderboard', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
    } else console.log(`  ⚠️ Skip submit (aid=${aid} qs=${qs.length})`);
    r = await api('PUT',`/api/exams/${eid}`,{title:'اختبار محدث'},ic);
    test('Update exam', r.status===200, `${r.status}`);
    r = await api('GET','/api/exams');
    test('List exams', r.status===200, `${r.status}`);
    r = await api('GET','/api/exams?myAttempts=true',null,sc);
    test('My attempts', r.status===200, `${r.status}`);
  }

  console.log('\n🔧 Admin...');
  r = await api('GET','/api/admin/stats',null,ac);
  test('Admin stats', r.status===200&&r.json?.data, `${r.status}`);
  r = await api('GET','/api/admin/users',null,ac);
  test('Admin users', r.status===200, `${r.status}`);
  r = await api('PUT','/api/admin/users',{userId:instrId.toString(),role:'instructor'},ac);
  test('Admin update role', r.status===200, `${r.status}`);
  r = await api('GET','/api/admin/stats',null,ic);
  test('Non-admin denied', r.status===403, `${r.status}`);

  console.log('\n📊 Instructor...');
  r = await api('GET','/api/instructor/stats',null,ic);
  test('Instructor stats', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);

  console.log('\n🔐 Content Token...');
  if(fcid) {
    r = await api('POST',`/api/courses/${fcid}/content-token`,{},sc);
    test('Content token', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
  }

  console.log('\n🔒 Validation...');
  r = await api('POST','/api/auth/register',{name:'A',email:'bad',password:'123'});
  test('Bad register→400', r.status===400);

  console.log('\n🌐 Pages...');
  for (const p of ['/','/login','/register','/courses','/dashboard',
    '/dashboard/admin','/dashboard/admin/users','/dashboard/admin/courses','/dashboard/admin/payments',
    '/dashboard/instructor','/dashboard/instructor/courses','/dashboard/instructor/courses/new','/dashboard/instructor/exams',
    '/dashboard/student','/dashboard/student/courses','/dashboard/student/exams','/dashboard/student/profile']) {
    const res = await fetch(`${BASE}${p}`,{redirect:'manual'});
    test(`${p} → ${res.status}`, [200,302,307].includes(res.status));
  }

  console.log('\n'+'='.repeat(50));
  console.log(`📊 ${passed} passed, ${failed} failed / ${passed+failed} total`);
  if(failures.length) { console.log('\n❌ Failures:'); failures.forEach(f=>console.log(`  - ${f.name}: ${f.detail||''}`)); }
  console.log('='.repeat(50));
  process.exit(failed?1:0);
}
main().catch(e=>{console.error(e);process.exit(1)});
// Comprehensive API Test Script v2
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3000';
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

async function setupDB() {
  console.log('\n🔧 Setting up test data...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    await db.collection(col.name).deleteMany({});
  }

  const salt = await bcrypt.genSalt(12);
  const hashedPwd = await bcrypt.hash('Test1234!', salt);

  const adminResult = await db.collection('users').insertOne({
    name: 'مسؤول النظام', email: 'admin@test.com', password: hashedPwd,
    phone: '01012345678', role: 'admin', isActive: true, isEmailVerified: true,
    createdAt: new Date(), updatedAt: new Date(),
  });

  const instrResult = await db.collection('users').insertOne({
    name: 'محمد المدرس', email: 'instructor@test.com', password: hashedPwd,
    phone: '01098765432', role: 'instructor', isActive: true, isEmailVerified: true,
    createdAt: new Date(), updatedAt: new Date(),
  });

  const studentResult = await db.collection('users').insertOne({
    name: 'أحمد الطالب', email: 'student@test.com', password: hashedPwd,
    phone: '01055555555', role: 'student', isActive: true, isEmailVerified: true,
    createdAt: new Date(), updatedAt: new Date(),
  });

  console.log('  Users: admin, instructor, student created');
  return {
    adminId: adminResult.insertedId,
    instructorId: instrResult.insertedId,
    studentId: studentResult.insertedId,
  };
}

async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() || [];
  const cookieHeader = csrfCookies.map(c => c.split(';')[0]).join('; ');

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieHeader },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
    redirect: 'manual',
  });

  const allCookies = loginRes.headers.getSetCookie?.() || [];
  return [...csrfCookies, ...allCookies].map(c => c.split(';')[0]).join('; ');
}

async function main() {
  const { adminId, instructorId, studentId } = await setupDB();
  await mongoose.disconnect();

  // ========== AUTH ==========
  console.log('\n🔑 Authentication...');
  const adminCookie = await login('admin@test.com', 'Test1234!');
  test('Admin login', adminCookie.includes('next-auth.session-token'));
  const instrCookie = await login('instructor@test.com', 'Test1234!');
  test('Instructor login', instrCookie.includes('next-auth.session-token'));
  const studentCookie = await login('student@test.com', 'Test1234!');
  test('Student login', studentCookie.includes('next-auth.session-token'));

  // ========== USER PROFILE ==========
  console.log('\n👤 User Profile...');
  const meRes = await api('GET', '/api/users/me', null, studentCookie);
  test('GET /api/users/me', meRes.status === 200 && meRes.json?.data?.name, `${meRes.status} ${JSON.stringify(meRes.json).slice(0,200)}`);

  const mePutRes = await api('PUT', '/api/users/me', { name: 'أحمد محمد' }, studentCookie);
  test('PUT /api/users/me', mePutRes.status === 200, `${mePutRes.status} ${JSON.stringify(mePutRes.json).slice(0,200)}`);

  const unauthRes = await api('GET', '/api/users/me');
  test('Unauth → 401', unauthRes.status === 401);

  // ========== COURSES ==========
  console.log('\n📚 Courses...');
  const createCourseRes = await api('POST', '/api/courses', {
    title: 'دورة اختبارية في البرمجة',
    description: 'هذه دورة اختبارية لتعلم أساسيات البرمجة بلغة جافاسكريبت وهي شاملة ومفصلة',
    shortDescription: 'دورة البرمجة الأساسية',
    price: 299, category: 'programming', level: 'beginner', language: 'ar',
    tags: ['javascript'], requirements: ['حاسوب'], whatYouLearn: ['أساسيات JS'],
  }, instrCookie);
  test('Create paid course', createCourseRes.status === 201, `${createCourseRes.status} ${JSON.stringify(createCourseRes.json).slice(0,300)}`);
  const courseId = createCourseRes.json?.data?._id;

  const freeRes = await api('POST', '/api/courses', {
    title: 'دورة مجانية للمبتدئين',
    description: 'دورة مجانية شاملة ومفصلة لتعلم البرمجة من الصفر بدون اي تكاليف',
    price: 0, category: 'programming', level: 'beginner',
  }, instrCookie);
  test('Create free course', freeRes.status === 201, `${freeRes.status} ${JSON.stringify(freeRes.json).slice(0,200)}`);
  const freeCourseId = freeRes.json?.data?._id;

  if (courseId) {
    const getCourseRes = await api('GET', `/api/courses/${courseId}`);
    test('GET /api/courses/:id', getCourseRes.status === 200, `${getCourseRes.status}`);

    const updateRes = await api('PUT', `/api/courses/${courseId}`, { title: 'دورة محدثة', price: 199 }, instrCookie);
    test('PUT /api/courses/:id', updateRes.status === 200, `${updateRes.status} ${JSON.stringify(updateRes.json).slice(0,200)}`);

    const listRes = await api('GET', '/api/courses');
    test('GET /api/courses (list)', listRes.status === 200 && Array.isArray(listRes.json?.data?.courses), `${listRes.status}`);

    const forbiddenRes = await api('POST', '/api/courses', {
      title: 'test', description: 'a long enough description', price: 0, category: 'x', level: 'beginner'
    }, studentCookie);
    test('Student cannot create (403)', forbiddenRes.status === 403, `${forbiddenRes.status}`);
  }

  // ========== ENROLLMENT ==========
  console.log('\n📝 Enrollment...');
  if (freeCourseId) {
    await api('PUT', `/api/courses/${freeCourseId}`, { isPublished: true }, instrCookie);

    const enrollRes = await api('POST', '/api/payments/initiate', { courseId: freeCourseId, method: 'card' }, studentCookie);
    test('Free course enroll', enrollRes.status === 200 && enrollRes.json?.data?.enrolled, `${enrollRes.status} ${JSON.stringify(enrollRes.json).slice(0,200)}`);

    const enrollListRes = await api('GET', '/api/enrollments', null, studentCookie);
    test('GET /api/enrollments', enrollListRes.status === 200, `${enrollListRes.status} ${JSON.stringify(enrollListRes.json).slice(0,200)}`);
  }

  // ========== EXAMS ==========
  console.log('\n📝 Exams...');
  const examCourseId = freeCourseId || courseId;
  const createExamRes = await api('POST', '/api/exams', {
    title: 'اختبار البرمجة الأول',
    description: 'اختبار شامل',
    course: examCourseId,
    duration: 30, passingScore: 60, maxAttempts: 3,
    questions: [
      { type: 'mcq', text: 'ما لغة الويب الأشهر؟', options: [
        { text: 'JavaScript', isCorrect: true }, { text: 'Python', isCorrect: false },
        { text: 'Java', isCorrect: false }, { text: 'C++', isCorrect: false },
      ], points: 10, order: 0 },
      { type: 'truefalse', text: 'HTML ليست لغة برمجة', options: [
        { text: 'صح', isCorrect: true }, { text: 'خطأ', isCorrect: false },
      ], points: 10, order: 1 },
    ],
  }, instrCookie);
  test('Create exam', createExamRes.status === 201, `${createExamRes.status} ${JSON.stringify(createExamRes.json).slice(0,300)}`);
  const examId = createExamRes.json?.data?._id;

  if (examId) {
    const publishRes = await api('PUT', `/api/exams/${examId}`, { isPublished: true }, instrCookie);
    test('Publish exam', publishRes.status === 200, `${publishRes.status} ${JSON.stringify(publishRes.json).slice(0,200)}`);

    const getExamRes = await api('GET', `/api/exams/${examId}`, null, studentCookie);
    test('GET /api/exams/:id', getExamRes.status === 200, `${getExamRes.status}`);

    const startRes = await api('POST', `/api/exams/${examId}/start`, {}, studentCookie);
    test('Start exam attempt', startRes.status === 200 || startRes.status === 201, `${startRes.status} ${JSON.stringify(startRes.json).slice(0,300)}`);

    const attemptId = startRes.json?.data?.attempt?._id;
    const examQs = startRes.json?.data?.exam?.questions || [];

    if (attemptId && examQs.length > 0) {
      const submitData = {
        examId, attemptId,
        answers: examQs.map(q => ({
          questionId: q._id,
          selectedOption: q.options?.[0]?._id || q.options?.[0]?.text,
        })),
      };
      const submitRes = await api('POST', '/api/exams/submit', submitData, studentCookie);
      test('Submit exam', submitRes.status === 200, `${submitRes.status} ${JSON.stringify(submitRes.json).slice(0,300)}`);

      const lbRes = await api('GET', `/api/exams/${examId}/leaderboard`);
      test('Leaderboard', lbRes.status === 200, `${lbRes.status} ${JSON.stringify(lbRes.json).slice(0,200)}`);
    } else {
      console.log(`  ⚠️  Skip submit (attemptId=${attemptId}, qs=${examQs.length})`);
    }

    const updateExamRes = await api('PUT', `/api/exams/${examId}`, { title: 'اختبار محدث' }, instrCookie);
    test('Update exam', updateExamRes.status === 200, `${updateExamRes.status}`);

    const listExamRes = await api('GET', '/api/exams');
    test('List exams', listExamRes.status === 200, `${listExamRes.status}`);

    const attemptsRes = await api('GET', '/api/exams?myAttempts=true', null, studentCookie);
    test('My attempts', attemptsRes.status === 200, `${attemptsRes.status}`);
  }

  // ========== ADMIN ==========
  console.log('\n🔧 Admin APIs...');
  const adminStatsRes = await api('GET', '/api/admin/stats', null, adminCookie);
  test('Admin stats', adminStatsRes.status === 200 && adminStatsRes.json?.data, `${adminStatsRes.status}`);

  const adminUsersRes = await api('GET', '/api/admin/users', null, adminCookie);
  test('Admin users list', adminUsersRes.status === 200, `${adminUsersRes.status}`);

  const roleUpdateRes = await api('PUT', '/api/admin/users', {
    userId: instructorId.toString(), role: 'instructor'
  }, adminCookie);
  test('Admin update role', roleUpdateRes.status === 200, `${roleUpdateRes.status}`);

  const instrAdminRes = await api('GET', '/api/admin/stats', null, instrCookie);
  test('Non-admin denied', instrAdminRes.status === 403, `${instrAdminRes.status}`);

  // ========== INSTRUCTOR STATS ==========
  console.log('\n📊 Instructor Stats...');
  const instrStatsRes = await api('GET', '/api/instructor/stats', null, instrCookie);
  test('Instructor stats', instrStatsRes.status === 200, `${instrStatsRes.status} ${JSON.stringify(instrStatsRes.json).slice(0,200)}`);

  // ========== CONTENT TOKEN ==========
  console.log('\n🔐 Content Token...');
  if (freeCourseId) {
    const tokenRes = await api('POST', `/api/courses/${freeCourseId}/content-token`, {}, studentCookie);
    test('Content token', tokenRes.status === 200, `${tokenRes.status} ${JSON.stringify(tokenRes.json).slice(0,200)}`);
  }

  // ========== VALIDATION ==========
  console.log('\n🔒 Validation...');
  const badRegRes = await api('POST', '/api/auth/register', { name: 'A', email: 'bad', password: '123' });
  test('Bad register → 400', badRegRes.status === 400);

  // ========== FRONTEND PAGES ==========
  console.log('\n🌐 Frontend Pages...');
  const pages = [
    '/', '/login', '/register', '/courses', '/dashboard',
    '/dashboard/admin', '/dashboard/admin/users',
    '/dashboard/admin/courses', '/dashboard/admin/payments',
    '/dashboard/instructor', '/dashboard/instructor/courses',
    '/dashboard/instructor/courses/new', '/dashboard/instructor/exams',
    '/dashboard/student', '/dashboard/student/courses',
    '/dashboard/student/exams', '/dashboard/student/profile',
  ];

  for (const page of pages) {
    const res = await fetch(`${BASE}${page}`, { redirect: 'manual' });
    const ok = res.status === 200 || res.status === 307 || res.status === 302;
    test(`${page} → ${res.status}`, ok, `expected 200/302/307`);
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    failures.forEach(f => console.log(`  - ${f.name}: ${f.detail || ''}`));
  }
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test error:', err); process.exit(1); });
// Comprehensive API Test Script
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3000';
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

  const mePatchRes = await api('PATCH', '/api/users/me', { name: 'أحمد محمد' }, studentCookie);
  test('PATCH /api/users/me updates name', mePatchRes.status === 200, `status=${mePatchRes.status} json=${JSON.stringify(mePatchRes.json).slice(0,200)}`);

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
    // Get course by ID
    const getCourseRes = await api('GET', `/api/courses/${courseId}`);
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
    const enrollRes = await api('POST', '/api/enrollments', { courseId }, studentCookie);
    test('POST /api/enrollments enrolls student', enrollRes.status === 201 || enrollRes.status === 200, `status=${enrollRes.status} json=${JSON.stringify(enrollRes.json).slice(0,200)}`);

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
      },
      {
        type: 'truefalse',
        text: 'HTML هي لغة برمجة',
        options: [
          { text: 'صح', isCorrect: false },
          { text: 'خطأ', isCorrect: true },
        ],
        points: 10,
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

    const attemptId = startRes.json?.data?._id;

    if (attemptId) {
      // Submit exam
      const submitData = {
        examId,
        attemptId,
        answers: [
          { questionIndex: 0, selectedOption: 0 },
          { questionIndex: 1, selectedOption: 1 },
        ],
      };
      const submitRes = await api('POST', '/api/exams/submit', submitData, studentCookie);
      test('POST /api/exams/submit submits answers', submitRes.status === 200, `status=${submitRes.status} json=${JSON.stringify(submitRes.json).slice(0,300)}`);

      // Leaderboard
      const lbRes = await api('GET', `/api/exams/${examId}/leaderboard`);
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
    const tokenRes = await api('POST', `/api/courses/${courseId}/content-token`, {}, studentCookie);
    test('POST /api/courses/:id/content-token', tokenRes.status === 200 || tokenRes.status === 403, `status=${tokenRes.status} json=${JSON.stringify(tokenRes.json).slice(0,200)}`);
  }

  // ===== Registration validation =====
  console.log('\n🔒 Testing Validation...');
  const badRegRes = await api('POST', '/api/auth/register', { name: 'A', email: 'bad', password: '123' });
  test('Invalid registration rejected', badRegRes.status === 400, `status=${badRegRes.status} json=${JSON.stringify(badRegRes.json).slice(0,200)}`);

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
