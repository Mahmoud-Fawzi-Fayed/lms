const BASE = 'http://localhost:3000';

async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() || [];
  const cookieHeader = csrfCookies.map((c) => c.split(';')[0]).join('; ');

  const form = new URLSearchParams({ csrfToken, email, password, json: 'true' });
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
  const cookie = [...csrfCookies, ...loginCookies].map((c) => c.split(';')[0]).join('; ');
  if (!cookie.includes('session-token')) {
    throw new Error('Admin login failed');
  }
  return cookie;
}

async function api(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  const json = await res.json();
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log(`PASS: ${msg}`);
}

async function main() {
  const adminCookie = await login('admin@lms.com', 'Admin1234');

  const courses = await api('/api/admin/courses?limit=100', adminCookie);
  assert(courses.status === 200 && courses.json.success, 'admin courses API returns success');
  assert((courses.json.data.courses || []).length > 0, 'admin courses API returns non-empty courses list');

  const users = await api('/api/admin/users?limit=20', adminCookie);
  assert(users.status === 200 && users.json.success, 'admin users API returns success');

  const stats = await api('/api/admin/stats', adminCookie);
  assert(stats.status === 200 && stats.json.success, 'admin stats API returns success');

  const firstCourse = courses.json.data.courses[0];
  const courseStats = await api(`/api/admin/stats/courses/${firstCourse._id}`, adminCookie);
  assert(courseStats.status === 200 && courseStats.json.success, 'course details stats API returns success');

  console.log('\nAll admin runtime checks passed.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
