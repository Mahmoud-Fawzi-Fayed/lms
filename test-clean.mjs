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
  if (ok) { console.log(`  âœ… ${name}`); passed++; }
  else { console.log(`  âŒ ${name} â€” ${detail||''}`); failed++; failures.push({name,detail}); }
}

async function setupDB() {
  console.log('\nðŸ”§ Setting up test data...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  for (const c of await db.listCollections().toArray()) await db.collection(c.name).deleteMany({});
  const hash = await bcrypt.hash('Test1234!', await bcrypt.genSalt(12));
  const mkUser = (name,email,role) => db.collection('users').insertOne({
    name,email,password:hash,phone:'0101234',role,isActive:true,isEmailVerified:true,createdAt:new Date(),updatedAt:new Date()
  });
  const a = await mkUser('Ù…Ø³Ø¤ÙˆÙ„','admin@test.com','admin');
  const i = await mkUser('Ù…Ø¯Ø±Ø³','instructor@test.com','instructor');
  const s = await mkUser('Ø·Ø§Ù„Ø¨','student@test.com','student');
  console.log('  âœ… Users created');
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

  console.log('\nðŸ”‘ Auth...');
  const ac = await login('admin@test.com'); test('Admin login', ac.includes('session-token'));
  const ic = await login('instructor@test.com'); test('Instructor login', ic.includes('session-token'));
  const sc = await login('student@test.com'); test('Student login', sc.includes('session-token'));

  console.log('\nðŸ‘¤ Profile...');
  let r = await api('GET','/api/users/me',null,sc);
  test('GET /api/users/me', r.status===200&&r.json?.data?.name, `${r.status}`);
  r = await api('PUT','/api/users/me',{name:'Ø£Ø­Ù…Ø¯ Ù…Ø­Ù…Ø¯'},sc);
  test('PUT /api/users/me', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,100)}`);
  r = await api('GET','/api/users/me');
  test('Unauthâ†’401', r.status===401);

  console.log('\nðŸ“š Courses...');
  r = await api('POST','/api/courses',{
    title:'Ø¯ÙˆØ±Ø© Ø§Ø®ØªØ¨Ø§Ø±ÙŠØ© ÙÙŠ Ø§Ù„Ø¨Ø±Ù…Ø¬Ø©',
    description:'Ù‡Ø°Ù‡ Ø¯ÙˆØ±Ø© Ø§Ø®ØªØ¨Ø§Ø±ÙŠØ© Ù„ØªØ¹Ù„Ù… Ø£Ø³Ø§Ø³ÙŠØ§Øª Ø§Ù„Ø¨Ø±Ù…Ø¬Ø© Ø¨Ù„ØºØ© Ø¬Ø§ÙØ§Ø³ÙƒØ±ÙŠØ¨Øª ÙˆÙ‡ÙŠ Ø´Ø§Ù…Ù„Ø© ÙˆÙ…ÙØµÙ„Ø©',
    price:299,category:'programming',level:'beginner',language:'ar',
    tags:['js'],requirements:['Ø­Ø§Ø³ÙˆØ¨'],whatYouLearn:['Ø£Ø³Ø§Ø³ÙŠØ§Øª JS'],
  },ic);
  test('Create paid course', r.status===201, `${r.status} ${JSON.stringify(r.json).slice(0,300)}`);
  const cid = r.json?.data?._id;

  r = await api('POST','/api/courses',{
    title:'Ø¯ÙˆØ±Ø© Ù…Ø¬Ø§Ù†ÙŠØ© Ù„Ù„Ù…Ø¨ØªØ¯Ø¦ÙŠÙ†',
    description:'Ø¯ÙˆØ±Ø© Ù…Ø¬Ø§Ù†ÙŠØ© Ø´Ø§Ù…Ù„Ø© ÙˆÙ…ÙØµÙ„Ø© Ù„ØªØ¹Ù„Ù… Ø§Ù„Ø¨Ø±Ù…Ø¬Ø© Ù…Ù† Ø§Ù„ØµÙØ± Ø¨Ø¯ÙˆÙ† Ø§ÙŠ ØªÙƒØ§Ù„ÙŠÙ',
    price:0,category:'programming',level:'beginner',
  },ic);
  test('Create free course', r.status===201, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
  const fcid = r.json?.data?._id;

  if(cid) {
    r = await api('GET',`/api/courses/${cid}`,null,ic);
    test('GET course by id', r.status===200, `${r.status}`);
    r = await api('PUT',`/api/courses/${cid}`,{title:'Ø¯ÙˆØ±Ø© Ù…Ø­Ø¯Ø«Ø©',price:199},ic);
    test('PUT course', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
    r = await api('GET','/api/courses');
    test('List courses', r.status===200&&Array.isArray(r.json?.data?.courses), `${r.status}`);
    r = await api('POST','/api/courses',{title:'t',description:'long enough desc',price:0,category:'x',level:'beginner'},sc);
    test('Student blocked (403)', r.status===403, `${r.status}`);
  }

  console.log('\nðŸ“ Enrollment...');
  if(fcid) {
    await api('PUT',`/api/courses/${fcid}`,{isPublished:true},ic);
    r = await api('POST','/api/payments/initiate',{courseId:fcid,method:'card'},sc);
    test('Free enroll', r.status===200&&r.json?.data?.enrolled, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
    r = await api('GET','/api/enrollments',null,sc);
    test('List enrollments', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
  }

  console.log('\nðŸ“ Exams...');
  const ecid = fcid||cid;
  r = await api('POST','/api/exams',{
    title:'Ø§Ø®ØªØ¨Ø§Ø± Ø§Ù„Ø¨Ø±Ù…Ø¬Ø©',description:'Ø§Ø®ØªØ¨Ø§Ø± Ø´Ø§Ù…Ù„',course:ecid,
    duration:30,passingScore:60,maxAttempts:3,
    questions:[
      {type:'mcq',text:'Ù…Ø§ Ù„ØºØ© Ø§Ù„ÙˆÙŠØ¨ Ø§Ù„Ø£Ø´Ù‡Ø±ØŸ',options:[
        {text:'JavaScript',isCorrect:true},{text:'Python',isCorrect:false},
        {text:'Java',isCorrect:false},{text:'C++',isCorrect:false},
      ],points:10,order:0},
      {type:'truefalse',text:'HTML Ù„ÙŠØ³Øª Ù„ØºØ© Ø¨Ø±Ù…Ø¬Ø©',options:[
        {text:'ØµØ­',isCorrect:true},{text:'Ø®Ø·Ø£',isCorrect:false},
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
    } else console.log(`  âš ï¸ Skip submit (aid=${aid} qs=${qs.length})`);
    r = await api('PUT',`/api/exams/${eid}`,{title:'Ø§Ø®ØªØ¨Ø§Ø± Ù…Ø­Ø¯Ø«'},ic);
    test('Update exam', r.status===200, `${r.status}`);
    r = await api('GET','/api/exams');
    test('List exams', r.status===200, `${r.status}`);
    r = await api('GET','/api/exams?myAttempts=true',null,sc);
    test('My attempts', r.status===200, `${r.status}`);
  }

  console.log('\nðŸ”§ Admin...');
  r = await api('GET','/api/admin/stats',null,ac);
  test('Admin stats', r.status===200&&r.json?.data, `${r.status}`);
  r = await api('GET','/api/admin/users',null,ac);
  test('Admin users', r.status===200, `${r.status}`);
  r = await api('PUT','/api/admin/users',{userId:instrId.toString(),role:'instructor'},ac);
  test('Admin update role', r.status===200, `${r.status}`);
  r = await api('GET','/api/admin/stats',null,ic);
  test('Non-admin denied', r.status===403, `${r.status}`);

  console.log('\nðŸ“Š Instructor...');
  r = await api('GET','/api/instructor/stats',null,ic);
  test('Instructor stats', r.status===200, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);

  console.log('\nðŸ” Content Token...');
  if(fcid) {
    r = await api('GET',`/api/courses/${fcid}/content-token?lessonId=test123`,null,sc);
    test('Content token', r.status===200 || r.status===400, `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
  }

  console.log('\nðŸ”’ Validation...');
  r = await api('POST','/api/auth/register',{name:'A',email:'bad',password:'123'});
  test('Bad registerâ†’400', r.status===400);

  console.log('\nðŸŒ Pages...');
  for (const p of ['/','/login','/register','/courses','/dashboard',
    '/dashboard/admin','/dashboard/admin/users','/dashboard/admin/courses','/dashboard/admin/payments',
    '/dashboard/instructor','/dashboard/instructor/courses','/dashboard/instructor/courses/new','/dashboard/instructor/exams',
    '/dashboard/student','/dashboard/student/courses','/dashboard/student/exams','/dashboard/student/profile']) {
    const res = await fetch(`${BASE}${p}`,{redirect:'manual'});
    test(`${p} â†’ ${res.status}`, [200,302,307].includes(res.status));
  }

  console.log('\n'+'='.repeat(50));
  console.log(`ðŸ“Š ${passed} passed, ${failed} failed / ${passed+failed} total`);
  if(failures.length) { console.log('\nâŒ Failures:'); failures.forEach(f=>console.log(`  - ${f.name}: ${f.detail||''}`)); }
  console.log('='.repeat(50));
  process.exit(failed?1:0);
}
main().catch(e=>{console.error(e);process.exit(1)});
