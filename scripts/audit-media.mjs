/**
 * Audit script — verifies every video / pdf lesson's filePath in MongoDB
 * actually points to a file on disk inside the container's view.
 *
 * Usage (from a host shell):
 *   docker exec -i lms-app node /app/scripts/audit-media.mjs
 *
 * Or load the connection string yourself and run on the host:
 *   MONGODB_URI=mongodb://lms-mongo:27017/lms_0xray node scripts/audit-media.mjs
 */
import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(2);
}

const dbName = (() => {
  try { return new URL(uri).pathname.replace(/^\//, '') || 'lms_0xray'; }
  catch { return 'lms_0xray'; }
})();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

function inUploads(p) {
  if (!p) return false;
  const r = path.resolve(p);
  return r === UPLOADS_DIR || r.startsWith(UPLOADS_DIR + path.sep);
}

function remap(filePath) {
  const norm = String(filePath).replace(/\\/g, '/');
  const i = norm.lastIndexOf('/uploads/');
  if (i === -1) return null;
  const rel = norm.slice(i + '/uploads/'.length);
  return path.resolve(UPLOADS_DIR, rel);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const courses = await db.collection('courses').find({}, {
  projection: { _id: 1, title: 1, slug: 1, isPublished: 1, modules: 1, instructor: 1 },
}).toArray();

let videoCount = 0, pdfCount = 0;
let videosOK = 0, videosMissing = 0, videosOutside = 0;
let pdfsOK = 0, pdfsMissing = 0;
const issues = [];

for (const c of courses) {
  const mods = c.modules || [];
  for (const mod of mods) {
    for (const lesson of (mod.lessons || [])) {
      const type = lesson.type;
      const fp = lesson.filePath;
      if (!['video', 'pdf'].includes(type)) continue;
      if (!fp) {
        // text/quiz lessons or empty media — skip silently
        continue;
      }
      if (type === 'video') videoCount++;
      if (type === 'pdf')   pdfCount++;

      let resolved = path.resolve(fp);
      let safe = inUploads(resolved);

      // Remap legacy absolute paths (e.g. /var/www/lms/uploads/...) into the
      // current uploads dir, mirroring the runtime route's behavior.
      if (!safe) {
        const remapped = remap(fp);
        if (remapped && inUploads(remapped)) {
          resolved = remapped;
          safe = true;
        }
      }

      if (!safe) {
        if (type === 'video') videosOutside++;
        issues.push({
          course: c.slug || String(c._id),
          courseId: String(c._id),
          lessonId: String(lesson._id),
          title: lesson.title || '(untitled)',
          type,
          dbPath: fp,
          status: 'OUTSIDE_UPLOADS',
        });
        continue;
      }

      const exists = fs.existsSync(resolved);
      if (exists) {
        try {
          const st = fs.statSync(resolved);
          if (st.isFile() && st.size > 0) {
            if (type === 'video') videosOK++;
            if (type === 'pdf')   pdfsOK++;
          } else {
            if (type === 'video') videosMissing++;
            if (type === 'pdf')   pdfsMissing++;
            issues.push({
              course: c.slug || String(c._id), courseId: String(c._id),
              lessonId: String(lesson._id), title: lesson.title,
              type, dbPath: fp, resolvedPath: resolved, status: 'EMPTY_OR_NOT_FILE',
            });
          }
        } catch (err) {
          if (type === 'video') videosMissing++;
          if (type === 'pdf')   pdfsMissing++;
          issues.push({
            course: c.slug || String(c._id), courseId: String(c._id),
            lessonId: String(lesson._id), title: lesson.title,
            type, dbPath: fp, status: 'STAT_ERROR: ' + err.message,
          });
        }
      } else {
        if (type === 'video') videosMissing++;
        if (type === 'pdf')   pdfsMissing++;
        issues.push({
          course: c.slug || String(c._id), courseId: String(c._id),
          lessonId: String(lesson._id), title: lesson.title,
          type, dbPath: fp, resolvedPath: resolved, status: 'MISSING',
        });
      }
    }
  }
}

console.log('=== Media audit ===');
console.log(`Database: ${dbName}`);
console.log(`Uploads dir: ${UPLOADS_DIR}`);
console.log(`Courses scanned: ${courses.length}`);
console.log('');
console.log(`Videos referenced: ${videoCount}`);
console.log(`  OK:        ${videosOK}`);
console.log(`  MISSING:   ${videosMissing}`);
console.log(`  OUTSIDE:   ${videosOutside}`);
console.log('');
console.log(`PDFs referenced:   ${pdfCount}`);
console.log(`  OK:        ${pdfsOK}`);
console.log(`  MISSING:   ${pdfsMissing}`);
console.log('');

if (issues.length === 0) {
  console.log('✓ All media references resolve to a real, non-empty file inside uploads/.');
} else {
  console.log(`✗ ${issues.length} issue(s):`);
  for (const i of issues) {
    console.log(`  [${i.status}]  course=${i.course}  lesson=${i.lessonId}  type=${i.type}`);
    console.log(`     title:    ${i.title}`);
    console.log(`     db.path:  ${i.dbPath}`);
    if (i.resolvedPath) console.log(`     resolved: ${i.resolvedPath}`);
  }
}

// Also report any video files on disk NOT referenced by any lesson — useful
// for spotting orphans we could clean up but should NOT delete here.
const referenced = new Set();
for (const c of courses) {
  for (const mod of (c.modules || [])) {
    for (const lesson of (mod.lessons || [])) {
      if (lesson.filePath) {
        const r = path.resolve(lesson.filePath);
        if (inUploads(r)) referenced.add(r);
        const r2 = remap(lesson.filePath);
        if (r2) referenced.add(r2);
      }
    }
  }
}

let videosOnDisk = [];
try {
  videosOnDisk = fs.readdirSync(path.join(UPLOADS_DIR, 'videos'))
    .map((f) => path.join(UPLOADS_DIR, 'videos', f))
    .filter((p) => fs.statSync(p).isFile());
} catch { /* directory may not exist */ }

const orphans = videosOnDisk.filter((p) => !referenced.has(p));
console.log('');
console.log(`Video files on disk: ${videosOnDisk.length}`);
console.log(`  referenced by DB:   ${videosOnDisk.length - orphans.length}`);
console.log(`  orphan (no lesson): ${orphans.length}   (kept; not deleted)`);
if (orphans.length > 0 && orphans.length <= 25) {
  for (const o of orphans) console.log(`    - ${path.basename(o)}`);
}

await client.close();
process.exit(issues.length === 0 ? 0 : 1);
