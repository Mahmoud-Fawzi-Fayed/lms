# Full Code Review

Project: **LMS** (Arabic-first Learning Management System)
Stack: Next.js 14 (App Router) · TypeScript · MongoDB/Mongoose 8 · NextAuth v4 · Paymob payments · Tailwind UI
Review scope: complete repository under `src/`, top-level config, and existing integration scripts.

---

## 1. Architecture overview

| Layer | Where | Notes |
|---|---|---|
| Routing & UI | `src/app/**` | App Router. Server components mixed with `'use client'` islands. Arabic RTL throughout. |
| API | `src/app/api/**/route.ts` | Edge-/Node-runtime route handlers. All business logic. |
| Auth | NextAuth Credentials (JWT, 7-day) | Configured in [src/lib/auth.ts](src/lib/auth.ts). |
| Persistence | Mongoose models | [src/models/](src/models/) — User, Course, Exam, ExamAttempt, Enrollment, ExamEnrollment, Payment. |
| Cross-cutting libs | [src/lib/](src/lib/) | `api-helpers`, `content-token`, `validations`, `academic-year`, `paymob`, `db`. |
| Middleware | [middleware.ts](middleware.ts) | Page-level role gating + baseline security headers. |
| Build/runtime config | [next.config.js](next.config.js) | CSP, HSTS, frame headers. |

### Domain model

* **Users** have `role: 'student' | 'instructor' | 'admin'`, `academicYear`, `isActive`.
* **Courses** belong to an `instructor`, contain `modules → lessons`, may be `published`, may have a `targetYear`.
* **Exams** can be linked to a Course (course-paid) or stand-alone (self-paid). Have versioned `questions` and `passingScore`.
* **ExamAttempt** stores a `questionSnapshot` (with `correctAnswer`) at start, then graded answers and final score.
* **Enrollment / ExamEnrollment** gate access; both require an active Payment for paid items.
* **Payment** records Paymob transaction with idempotency by `paymobTransactionId`.

### Cross-cutting helpers

* [src/lib/api-helpers.ts](src/lib/api-helpers.ts) exports `withAuth`, `getAuthUser`, `rateLimit`, `escapeRegex`, `isValidObjectId`, `apiError`, `apiSuccess`.
* `withAuth(handler, allowedRoles?)` wraps route handlers, fetches the user from JWT, **now also verifies `isActive` and live role from DB** (30 s cache).
* `rateLimit(id, max, windowMs)` is per-process Map-backed. Suitable for a single Node instance; needs Redis for horizontal scale.
* `isValidObjectId` is **stricter** than Mongoose's built-in: requires the canonical 24-hex form, blocking 12-byte string / number bypasses.

---

## 2. Modules

### 2.1 Auth ([src/app/api/auth/](src/app/api/auth/) + [src/lib/auth.ts](src/lib/auth.ts))

* Credentials provider with bcrypt (12 rounds).
* JWT strategy, 7-day `maxAge`, `Secure + SameSite=Lax + HttpOnly` cookies in production.
* Registration ([src/app/api/auth/register/route.ts](src/app/api/auth/register/route.ts)) enforces strong password via `registerSchema` and is IP-rate-limited (5/hour). `role` is hardcoded to `'student'` — **no mass assignment**.
* **Fixed in this review**: brute-force / credential-stuffing rate limit added to `authorize()` — 10 attempts / 15 min per IP, 5 / 15 min per email.

### 2.2 Courses ([src/app/api/courses/](src/app/api/courses/))

* List route enforces published-only + targetYear filtering for students.
* Mutation routes verify ownership (`instructor === user.id`) or admin.
* **PUT** strips client-supplied `filePath`, `fileUrl`, `videoControls` — instructor cannot inject another user's filePath.
* **DELETE** refuses if active enrollments exist; cleans uploaded files only inside `uploads/` or `public/thumbnails/`.
* Upload route ([src/app/api/courses/[id]/upload/route.ts](src/app/api/courses/[id]/upload/route.ts)) is the most heavily hardened path: chunked uploads, MIME+extension cross-check, `crypto.randomUUID()` filenames, path-traversal guards, lstat-based symlink rejection.

### 2.3 Exams ([src/app/api/exams/](src/app/api/exams/))

* **`/exams/[id]/start`**: creates an ExamAttempt with a `questionSnapshot` (including `correctAnswer`) so grading is immune to instructor edits mid-attempt.
* **`/exams/submit`**: grading is now extracted into [src/lib/exam-grading.ts](src/lib/exam-grading.ts) (pure function, unit-tested). Final write is an **atomic `findOneAndUpdate({status:'in-progress'})`** — prevents double-submission scoring inflation.
* **Fixed in this review**:
  * PUT `/exams/[id]` previously allowed an instructor to reassign `course` to another instructor's course. Now revalidates ownership of the **new** course.
  * `/exams/[id]/start` had a TOCTOU window between `countDocuments` and `Create` that could exceed `maxAttempts`. Added per-user-per-exam rate limit (6/min) as a pragmatic defense; a partial unique index `{user, exam, status:'in-progress'}` is recommended as a follow-up.

### 2.4 Enrollments, Payments, Webhooks

* [src/app/api/enrollments/route.ts](src/app/api/enrollments/route.ts) validates that `lessonId` belongs to the enrolled course before marking it complete. Year-restricted for students.
* [src/app/api/payments/initiate/route.ts](src/app/api/payments/initiate/route.ts) and exam-payment counterpart create Paymob orders with the user's id stored as `userId` in `merchantOrderId`, never trusted from the client.
* [src/app/api/webhooks/paymob/route.ts](src/app/api/webhooks/paymob/route.ts) — exemplary: HMAC verify → idempotency check → amount/currency/merchantOrderId checks → activate only on `success && !pending && !error_occured`. `enrollmentCount` increments only on first activation.

### 2.5 Content protection ([src/app/api/content/[token]/route.ts](src/app/api/content/[token]/route.ts))

* HMAC-signed, user-bound tokens (4 hr).
* Verifies `Sec-Fetch-Site === 'same-origin'` and `Sec-Fetch-Dest` matches mode (`video`/`audio` for stream, `image|document` for raw PDF).
* Range-streaming for video; per-token rate limit `4 / hour` on raw PDF download.
* lstat-based symlink rejection on the resolved path.

### 2.6 Admin ([src/app/api/admin/](src/app/api/admin/))

* Admin can't self-demote or self-deactivate.
* User search uses `escapeRegex` — no NoSQL regex injection.

---

## 3. Findings table

| # | File | Severity | Description | Status |
|---|---|---|---|---|
| C-1 | [src/lib/auth.ts](src/lib/auth.ts) | High | No rate limit on credential `authorize()` → credential-stuffing & brute-force possible. | **Fixed** |
| C-2 | [src/app/api/exams/[id]/route.ts](src/app/api/exams/[id]/route.ts) PUT | High | Instructor could reassign their exam to another instructor's course (`allowedFields` includes `'course'`, no re-check). | **Fixed** |
| C-3 | [src/app/api/exams/[id]/start/route.ts](src/app/api/exams/[id]/start/route.ts) | Medium | `countDocuments` → `Create` is non-atomic; concurrent starts can exceed `maxAttempts`. | **Fixed (rate-limited)** + index recommended |
| C-4 | [src/lib/api-helpers.ts](src/lib/api-helpers.ts) `withAuth` | Medium | Deactivated user with valid JWT could keep acting until token expiry. Stale `role` in JWT. | **Fixed** (live DB check, 30 s cache) |
| C-5 | [next.config.js](next.config.js) | Medium | No `Strict-Transport-Security` header. | **Fixed** (production-only) |
| C-6 | [package.json](package.json) + [src/app/courses/[slug]/page.tsx](src/app/courses/[slug]/page.tsx) | Bug | `dompurify` imported but missing from `dependencies` → production build would fail. | **Fixed** |
| C-7 | [package.json](package.json) | Hygiene | No test framework configured. | **Fixed** (vitest + 49 unit tests) |
| L-1 | [src/lib/api-helpers.ts](src/lib/api-helpers.ts) | Low | In-memory rate-limiter not shared across instances. | Documented |
| L-2 | [src/app/api/exams/submit/route.ts](src/app/api/exams/submit/route.ts) | Low | Grading was duplicated/untestable inside the handler. | **Fixed** (extracted to `exam-grading.ts`) |

---

## 4. Code-quality observations (non-security)

* Heavy use of `any` in route handlers when interacting with Mongoose docs. Acceptable here but a future tightening pass could introduce typed model interfaces (Mongoose 8 `HydratedDocument`).
* Some routes catch errors with a generic `apiError('Server error', 500)` — good for not leaking internals; pair with a `console.error` so ops can correlate (already done in most routes).
* `test-*.mjs` integration scripts in repo root require a running server and live DB. Useful, but they shouldn't be the only safety net. The new `tests/` directory now covers pure logic that doesn't need infra.
* Several large client components in `src/app/courses/[slug]/page.tsx` and `src/components/SecurePdfViewer.tsx` mix data fetching, rendering, and DRM — viable, but a refactor into hooks (`useCourse`, `useSecureContent`) would improve testability later. Not changed in this audit.

---

## 5. What was changed in this review

* [src/lib/auth.ts](src/lib/auth.ts) — login rate limit (IP + email).
* [src/lib/api-helpers.ts](src/lib/api-helpers.ts) — live `isActive`/role check in `withAuth`.
* [src/app/api/exams/[id]/route.ts](src/app/api/exams/[id]/route.ts) — ownership re-check on course reassignment.
* [src/app/api/exams/[id]/start/route.ts](src/app/api/exams/[id]/start/route.ts) — per-user-per-exam rate limit.
* [src/app/api/exams/submit/route.ts](src/app/api/exams/submit/route.ts) — uses extracted grading.
* [src/lib/exam-grading.ts](src/lib/exam-grading.ts) — **new**, pure grading function.
* [next.config.js](next.config.js) — HSTS header (prod).
* [package.json](package.json) — added `dompurify`, `@types/dompurify`, `vitest`, `test` / `test:watch` scripts.
* [vitest.config.ts](vitest.config.ts), [tests/setup.ts](tests/setup.ts), [tests/](tests/) — **new** 49-test suite.

---

## 6. Recommendations (not done — future work)

1. Replace in-memory `rateLimit` with a Redis (or Upstash) backend when running > 1 instance.
2. Add a **partial unique index** `{ user: 1, exam: 1 } where { status: 'in-progress' }` on `ExamAttempt` to make exam-start guaranteed-single-flight.
3. Add an integration-test layer (`supertest` + `mongodb-memory-server`) to cover the API surface.
4. Centralize the audit-log writes around sensitive actions (login, role changes, payment activation, course delete).
5. Move secrets to a managed vault and rotate `NEXTAUTH_SECRET` / `CONTENT_SECRET` / Paymob keys.
6. Consider a stricter CSP: today `connect-src` allows broad Paymob origins; tighten once payment iframe behavior is known.
