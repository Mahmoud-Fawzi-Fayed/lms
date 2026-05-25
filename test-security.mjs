// Security & edge-case test suite — exercises the bugs fixed in the audit.
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3003';
const MONGO_URI = 'mongodb://localhost:27017/lms_0xray';

let passed = 0, failed = 0;
const failures = [];

async function api(method, path, body, cookie, extraHeaders = {}) {
  const opts = { method, headers: { ...extraHeaders } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (cookie) opts.headers['Cookie'] = cookie;
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function test(name, ok, detail) {
  if (ok) { console.log(`  ✅ ${name}`); passed++; }
  else    { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; failures.push({name,detail}); }
}

async function setupDB() {
  console.log('\n🔧 Setup…');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  for (const c of await db.listCollections().toArray()) await db.collection(c.name).deleteMany({});
  const hash = await bcrypt.hash('Test1234!', await bcrypt.genSalt(12));
  const mk = (n,e,r) => db.collection('users').insertOne({
    name:n,email:e,password:hash,phone:'0101234',role:r,
    isActive:true,isEmailVerified:true,createdAt:new Date(),updatedAt:new Date(),
  });
  const a = await mk('admin','admin@test.com','admin');
  const i = await mk('instr','instructor@test.com','instructor');
  const i2 = await mk('instr2','instructor2@test.com','instructor');
  const s = await mk('std','student@test.com','student');
  const s2 = await mk('std2','student2@test.com','student');
  console.log('  ✅ users seeded');
  return { aId:a.insertedId, iId:i.insertedId, i2Id:i2.insertedId, sId:s.insertedId, s2Id:s2.insertedId };
}

async function login(email) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cc = csrfRes.headers.getSetCookie?.() || [];
  const ch = cc.map(c => c.split(';')[0]).join('; ');
  const lr = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded', 'Cookie':ch },
    body:new URLSearchParams({ csrfToken, email, password:'Test1234!', json:'true' }),
    redirect:'manual',
  });
  const ac = lr.headers.getSetCookie?.() || [];
  return [...cc, ...ac].map(c => c.split(';')[0]).join('; ');
}

async function main() {
  const { iId, i2Id, sId, s2Id } = await setupDB();
  await mongoose.disconnect();

  const ac = await login('admin@test.com');
  const ic = await login('instructor@test.com');
  const ic2 = await login('instructor2@test.com');
  const sc = await login('student@test.com');
  const sc2 = await login('student2@test.com');

  // -------- USER PROFILE input validation --------
  console.log('\n🛡  PUT /api/users/me — input validation');
  let r = await api('PUT','/api/users/me',{ name:'a' },sc);
  test('name too short → 400', r.status === 400, `${r.status}`);
  r = await api('PUT','/api/users/me',{ name:'A'.repeat(200) },sc);
  test('name too long → 400', r.status === 400);
  r = await api('PUT','/api/users/me',{ avatar:'javascript:alert(1)' },sc);
  test('avatar javascript: URL rejected', r.status === 400);
  r = await api('PUT','/api/users/me',{ avatar:'data:image/svg+xml;base64,xxx' },sc);
  test('avatar data: URL rejected', r.status === 400);
  r = await api('PUT','/api/users/me',{ avatar:'https://cdn.example.com/x.png' },sc);
  test('avatar https URL accepted', r.status === 200);
  r = await api('PUT','/api/users/me',{ phone:'<script>' },sc);
  test('bad phone rejected', r.status === 400);
  r = await api('PUT','/api/users/me',{},sc);
  test('empty body rejected', r.status === 400);
  r = await api('PUT','/api/users/me',{ role:'admin' },sc);
  test('privilege escalation via role ignored', r.status === 400 || (r.status===200 && r.json?.data?.role==='student'));

  // -------- ADMIN role gate --------
  console.log('\n🛡  Admin endpoint role gates');
  r = await api('GET','/api/admin/stats', null, sc);
  test('student → /api/admin/stats 403', r.status === 403);
  r = await api('GET','/api/admin/users', null, ic);
  test('instructor → /api/admin/users 403', r.status === 403);
  r = await api('PUT','/api/admin/users',{ userId:sId.toString(), role:'admin' }, sc);
  test('student cannot self-promote via /api/admin/users', r.status === 403);
  r = await api('GET','/api/admin/payments', null, sc);
  test('student → /api/admin/payments 403', r.status === 403);
  r = await api('GET','/api/admin/courses', null, sc);
  test('student → /api/admin/courses 403', r.status === 403);

  // -------- ADMIN users PUT validation --------
  r = await api('PUT','/api/admin/users',{ userId:sId.toString() }, ac);
  test('admin update with empty fields → 400', r.status === 400);
  r = await api('PUT','/api/admin/users',{ userId:'bad-id', role:'student' }, ac);
  test('admin update invalid id → 400', r.status === 400);

  // -------- COURSE IDOR --------
  console.log('\n🛡  Course / lesson IDOR');
  let cr = await api('POST','/api/courses',{
    title:'دورة سرية', description:'وصف طويل جداً لتجاوز التحقق من الطول الأدنى للنص المطلوب',
    price:0, category:'programming', level:'beginner',
  }, ic);
  const cid = cr.json?.data?._id;
  test('instructor1 created course', !!cid);
  r = await api('PUT', `/api/courses/${cid}`, { title:'مسروق' }, ic2);
  test('instructor2 cannot edit instructor1 course', r.status === 403 || r.status === 404);
  r = await api('DELETE', `/api/courses/${cid}`, null, ic2);
  test('instructor2 cannot delete instructor1 course', r.status === 403 || r.status === 404);
  r = await api('GET', `/api/courses/${cid}`, null, sc);
  test('student cannot view unpublished course → 404', r.status === 404);

  // -------- LESSON-SETTINGS bounds --------
  console.log('\n🛡  Lesson-settings bounds');
  // Add a real module/lesson via raw DB
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.db.collection('courses').updateOne(
    { _id: new mongoose.Types.ObjectId(cid) },
    { $set: { modules: [{
        _id: new mongoose.Types.ObjectId(),
        title: 'Mod', lessons: [{
          _id: new mongoose.Types.ObjectId(),
          title:'L', type:'video', duration:1, order:0,
        }], order:0,
    }] } },
  );
  await mongoose.disconnect();
  r = await api('PATCH', `/api/courses/${cid}/lesson-settings`, { moduleIndex: 9999, lessonIndex: 0, videoControls:{ allowSpeed:true } }, ic);
  test('mi out-of-range rejected', r.status === 400 || r.status === 404);
  r = await api('PATCH', `/api/courses/${cid}/lesson-settings`, { moduleIndex: -1, lessonIndex: 0, videoControls:{ allowSpeed:true } }, ic);
  test('negative mi rejected', r.status === 400);
  r = await api('PATCH', `/api/courses/${cid}/lesson-settings`, { moduleIndex: 'abc', lessonIndex: 0, videoControls:{ allowSpeed:true } }, ic);
  test('non-int mi rejected', r.status === 400);
  r = await api('PATCH', `/api/courses/${cid}/lesson-settings`, { moduleIndex: 0, lessonIndex: 9999, videoControls:{ allowSpeed:true } }, ic);
  test('li out-of-range rejected', r.status === 400 || r.status === 404);
  r = await api('PATCH', `/api/courses/${cid}/lesson-settings`, { moduleIndex: 0, lessonIndex: 0, videoControls:{ allowSpeed:true, allowSkip:false } }, ic);
  test('valid lesson-settings accepted', r.status === 200);
  r = await api('PATCH', `/api/courses/${cid}/lesson-settings`, { moduleIndex: 0, lessonIndex: 0, videoControls:{ allowSpeed:false } }, ic2);
  test('non-owner instructor blocked from lesson-settings', r.status === 403 || r.status === 404);

  // -------- filePath / fileUrl injection via PUT modules --------
  // An attacker should NOT be able to set a lesson's filePath through the
  // course PUT body (only the upload route may write it after auth + mime checks).
  // Without the fix, a new lesson with filePath="…/uploads/videos/VICTIM.mp4"
  // would be persisted verbatim and stream another instructor's content.
  const poisoned = '/home/0xRay/lms/uploads/videos/VICTIM_STOLEN.mp4';
  r = await api('PUT', `/api/courses/${cid}`, {
    modules: [{
      title: 'M2', order: 0,
      lessons: [{
        title: 'Injected', type: 'video', duration: 1, order: 0,
        filePath: poisoned,
        fileUrl: 'uploaded',
        videoControls: { allowSeek: false, allowSkip: false, evil: 'yes' },
      }],
    }],
  }, ic);
  test('PUT modules with injected filePath returns success', r.status === 200);
  // Verify in DB that filePath was NOT persisted
  await mongoose.connect(MONGO_URI);
  const stored = await mongoose.connection.db.collection('courses').findOne(
    { _id: new mongoose.Types.ObjectId(cid) }
  );
  await mongoose.disconnect();
  const injectedLesson = stored?.modules?.[0]?.lessons?.[0];
  test('filePath was stripped from new lesson', !injectedLesson?.filePath, `got: ${injectedLesson?.filePath}`);
  test('fileUrl was stripped from new lesson', !injectedLesson?.fileUrl, `got: ${injectedLesson?.fileUrl}`);
  test('videoControls was not blindly copied from new lesson', !injectedLesson?.videoControls?.evil);

  // -------- EXAM IDOR + answer leakage --------
  console.log('\n🛡  Exam answer leakage');
  // Publish course
  await api('PUT', `/api/courses/${cid}`, { isPublished:true, price:0 }, ic);
  await api('POST','/api/payments/initiate',{ courseId:cid, method:'card' }, sc);

  const er = await api('POST','/api/exams',{
    title:'سري', description:'اختبار', course:cid, duration:5, passingScore:50, maxAttempts:3,
    questions:[
      { type:'mcq', text:'q', order:0, points:10,
        options:[{text:'A',isCorrect:true},{text:'B',isCorrect:false}] },
    ],
  }, ic);
  const eid = er.json?.data?._id;
  test('exam created', !!eid);
  await api('PUT', `/api/exams/${eid}`, { isPublished:true }, ic);

  // Student GET should NOT contain isCorrect / correctAnswer
  r = await api('GET', `/api/exams/${eid}`, null, sc);
  const studentExam = r.json?.data?.exam || r.json?.data;
  const hasLeak = JSON.stringify(studentExam).match(/isCorrect|correctAnswer/);
  test('student GET exam strips isCorrect/correctAnswer', !hasLeak, hasLeak ? 'LEAK FOUND' : '');

  // Student start should NOT return questionSnapshot
  r = await api('POST', `/api/exams/${eid}/start`, {}, sc);
  const startBody = JSON.stringify(r.json);
  test('start does not leak questionSnapshot', !startBody.includes('questionSnapshot'));
  test('start does not leak isCorrect', !startBody.includes('isCorrect'));

  // Non-owner instructor cannot update exam
  r = await api('PUT', `/api/exams/${eid}`, { title:'مسروق' }, ic2);
  test('instructor2 cannot update instructor1 exam', r.status === 403 || r.status === 404);

  // -------- CONTENT TOKEN scope --------
  console.log('\n🛡  Content-token + path-traversal guards');
  // Student2 not enrolled
  r = await api('GET', `/api/courses/${cid}/content-token?lessonId=nope`, null, sc2);
  test('non-enrolled student → token 403/404', [403, 404].includes(r.status));

  // -------- Upload route validation --------
  console.log('\n🛡  Upload route uploadId validation');
  // Forge a multipart-ish payload (we don't have a file but test path traversal in fields)
  // Just verify the route rejects unauthenticated requests
  r = await fetch(`${BASE}/api/courses/${cid}/upload`, { method:'POST' });
  test('upload requires auth', r.status === 401 || r.status === 400 || r.status === 405);

  // -------- ObjectId validation --------
  console.log('\n🛡  ObjectId validation');
  r = await api('GET', `/api/exams/not-an-id`, null, sc);
  test('GET exam invalid id → 400', r.status === 400);
  r = await api('PUT', `/api/courses/${'a'.repeat(24)}`, { title:'x' }, ac);
  test('PUT course non-existent id → 404', r.status === 404);

  // -------- Summary --------
  console.log('\n'+'='.repeat(60));
  console.log(`📊 ${passed} passed, ${failed} failed / ${passed+failed} total`);
  if (failures.length) { console.log('\n❌ Failures:'); failures.forEach(f => console.log(`  - ${f.name}: ${f.detail||''}`)); }
  console.log('='.repeat(60));
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
