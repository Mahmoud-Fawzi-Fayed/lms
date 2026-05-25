# Security Review

Project: **LMS** (Arabic-first Learning Management System)
Reviewer: Automated security audit pass.
Methodology: white-box code review with manual reasoning over OWASP Top 10 (2021) and LMS-specific abuse cases (grade tampering, content piracy, payment replay).

---

## 1. Executive summary

The codebase is **above average for a startup-stage LMS**: it already implements many defense-in-depth controls (HMAC-signed content tokens, atomic exam submission, payment-webhook HMAC + idempotency, strict ObjectId validation, MIME+extension cross-checks on upload, symlink rejection, CSP with `frame-ancestors 'none'`).

This audit found **2 High, 3 Medium, 1 Build-blocking bug, 2 Hygiene** issues — all fixed in this pass — and documented remaining residual risks below.

---

## 2. Threat model

| Actor | Goal | What stops them |
|---|---|---|
| **Student** | View paid content without paying; tamper grades; download videos. | `withAuth` + `Enrollment`/`ExamEnrollment` gates; `questionSnapshot` + atomic submit; HMAC content token + Sec-Fetch checks + rate limit. |
| **Instructor** | Edit other instructors' courses/exams; inflate their own analytics. | Ownership checks in PUT/DELETE; `allowedFields` whitelists; `enrollmentCount` gated by webhook idempotency. |
| **External attacker** | Account takeover; payment forgery; arbitrary file download. | bcrypt(12) + login rate limit; HMAC SHA-512 webhook signature; symlink/path-traversal guards; CSP + frame-ancestors. |
| **Insider with stolen JWT** | Continued access after admin deactivates them. | NEW: live `isActive` check in `withAuth` (30 s cache). |

---

## 3. OWASP Top 10 (2021) coverage

| Category | Status |
|---|---|
| A01 Broken Access Control | ✅ `withAuth(allowedRoles)` + ownership checks throughout. Cross-tenant data leakage explicitly tested for in code comments. Fixed: exam→course reassignment IDOR. |
| A02 Cryptographic Failures | ✅ bcrypt(12) for passwords; HMAC SHA-256 for content tokens; HMAC SHA-512 for Paymob webhook; `timingSafeEqual` in token verify. Secret length enforced (≥32). HSTS now set in prod. |
| A03 Injection | ✅ Mongoose models prevent operator injection; `escapeRegex` for `$regex`; Zod validates every body. |
| A04 Insecure Design | ✅ `questionSnapshot` immune to mid-attempt edits; webhook idempotency; payment activated only on confirmed Paymob success. |
| A05 Security Misconfiguration | ✅ CSP with `frame-ancestors 'none'`, `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`; **HSTS added in this review**. |
| A06 Vulnerable & Outdated Components | ⚠️ `npm audit` reports moderate/high vulns transitively (run `npm audit` for current list); `dompurify` was missing from deps — **fixed**. |
| A07 Identification & Authentication Failures | ✅ Strong password policy (upper+lower+digit+8); JWT 7-day with secure cookies; **login rate limit added** (IP + email buckets). |
| A08 Software & Data Integrity Failures | ✅ Paymob webhook HMAC, version-pinned deps. |
| A09 Logging & Monitoring | ⚠️ Errors `console.error`-d but no structured audit log. Recommended. |
| A10 SSRF | ✅ No user-controlled outbound URLs in fetch paths. Paymob URLs are configured server-side. |

---

## 4. LMS-specific abuse scenarios

| Scenario | Outcome |
|---|---|
| Student submits same attempt twice to re-grade. | **Blocked**. `findOneAndUpdate({_id, status:'in-progress'})` is atomic — second submit returns 409. |
| Instructor changes a question's `correctAnswer` after a student started. | **Mitigated**. Grading uses `questionSnapshot` taken at start. |
| Student tries to direct-link a video URL outside the player. | **Blocked**. Content token verifies Sec-Fetch-Site == `same-origin`, Sec-Fetch-Dest in `{video, audio}`. Token is per-user, HMAC-signed, 4-hr expiry. |
| Student scrapes all course PDFs. | **Rate-limited**. 4 raw-PDF downloads per token per hour. |
| Attacker forges a Paymob webhook to activate enrollment. | **Blocked**. HMAC SHA-512 verify; idempotency on `paymobTransactionId`; amount/currency/order checks. |
| Instructor sends mass-assignment payload to make themselves admin via `/users/me`. | **Blocked**. `allowedFields` whitelist does not include `role`. |
| Banned student keeps using their session until JWT expires. | **Blocked (NEW)**. `withAuth` performs a 30 s-cached live `isActive` + role lookup. |
| Brute-force or credential-stuffing against `/api/auth/...`. | **Blocked (NEW)**. 10/15 min per IP, 5/15 min per email in `authorize()`. |

---

## 5. Vulnerabilities found

| ID | Severity | Title | File:line | CWE | Fix |
|---|---|---|---|---|---|
| V-1 | High | Missing brute-force rate limit on credential login | [src/lib/auth.ts:14](src/lib/auth.ts) | CWE-307 | Added IP+email rate-limit buckets to `authorize()`. |
| V-2 | High | Broken access control on `PUT /api/exams/[id]` when reassigning `course` | [src/app/api/exams/[id]/route.ts](src/app/api/exams/[id]/route.ts) | CWE-639 / CWE-285 | When `update.course` changes, re-fetch new course and require `instructor === user.id` (or admin). |
| V-3 | Medium | Race in `POST /api/exams/[id]/start` allows exceeding `maxAttempts` | [src/app/api/exams/[id]/start/route.ts](src/app/api/exams/[id]/start/route.ts) | CWE-362 | Per-user-per-exam rate limit added; partial unique index recommended as follow-up. |
| V-4 | Medium | Deactivated user keeps acting until JWT expires; stale role in JWT | [src/lib/api-helpers.ts](src/lib/api-helpers.ts) | CWE-613 / CWE-1244 | Live `isActive`/role check in `withAuth` with 30 s cache. |
| V-5 | Medium | No HSTS header | [next.config.js](next.config.js) | CWE-319 | Added `Strict-Transport-Security` in production builds. |
| V-6 | Bug (build-blocker) | `dompurify` imported but missing from `dependencies` | [src/app/courses/[slug]/page.tsx](src/app/courses/[slug]/page.tsx) | — | Added to `package.json`. |
| V-7 | Low | In-memory rate limiter doesn't share state across instances | [src/lib/api-helpers.ts](src/lib/api-helpers.ts) | CWE-799 | Documented; recommend Redis for multi-instance deployments. |
| V-8 | Low | Grading logic was untestable inside route handler | [src/app/api/exams/submit/route.ts](src/app/api/exams/submit/route.ts) | — | Extracted to [src/lib/exam-grading.ts](src/lib/exam-grading.ts); 11 unit tests added. |

All "Fixed" items above were edited as part of this audit.

---

## 6. Residual / accepted risks

1. **Single-process rate limiting** — if the app scales horizontally, attackers can multiply their per-IP / per-email allowance by `N` instances. Move to Redis-backed `rateLimit` before scaling.
2. **No partial-unique index on `ExamAttempt`** for `(user, exam, status:'in-progress')`. The added rate limit makes exploitation impractical, but a DB-level guarantee is stronger. Migration ticket recommended.
3. **`npm audit` transitive findings** (10 moderate, 6 high at time of audit). These are in transitive dev/runtime deps; run `npm audit fix` after triage. Not fixed in this audit to avoid uncontrolled breaking changes.
4. **No persistent audit log** for sensitive actions (login, role change, payment activation, course delete). Recommended.
5. **CSRF**: NextAuth credentials flow + same-site cookies + CSP `frame-ancestors 'none'` provide effective mitigation, but adding explicit CSRF tokens on mutating endpoints would be belt-and-suspenders.
6. **DOM-XSS surface in course HTML descriptions** is limited by `DOMPurify.sanitize` on render. Defense holds as long as `dompurify` is the actual library installed (now declared as a dep).

---

## 7. Verification

* `npm test` — 49 unit tests pass, including 5 negative tests on `content-token` (tampered HMAC, garbage input, secret rotation), 6 negative tests on `validations`, and 11 tests on `exam-grading` covering all scoring branches.
* `npm run test:paymob-security` — pre-existing Paymob webhook security script (requires live infra) untouched.
* `test-security.mjs` — existing integration script untouched.
