# Test Plan

## 1. Strategy

The codebase has two complementary test layers:

| Layer | Where | Needs running infra? |
|---|---|---|
| **Unit tests (new)** | [tests/](tests/) — Vitest | No. Pure logic only. |
| Integration / smoke (pre-existing) | `test-*.mjs` at repo root, `npm run test:paymob-security` | Yes — live server on `:3003` + MongoDB. |

The new unit layer is designed to be runnable in CI on every push with **no external services**.

## 2. How to run

```bash
# install deps once
npm install

# run all unit tests
npm test

# watch mode for local TDD
npm run test:watch

# pre-existing integration / security scripts (require server + DB)
npm run dev               # in another terminal first
node test-security.mjs
npm run test:paymob-security
```

Expected unit-test output:

```
 Test Files  5 passed (5)
      Tests  49 passed (49)
```

## 3. What is covered

### 3.1 `tests/content-token.test.ts` (5 tests) — [src/lib/content-token.ts](src/lib/content-token.ts)

* Round-trip generate → verify returns the original `{userId, courseId, lessonId}`.
* Tampered HMAC → `null`.
* Random/garbage tokens → `null`.
* Tokens signed with a different secret → `null`.
* Missing or too-short `CONTENT_SECRET` → throws on generate.

### 3.2 `tests/validations.test.ts` (15 tests) — [src/lib/validations.ts](src/lib/validations.ts)

* `registerSchema` enforces password complexity (upper / lower / digit / length ≥ 8).
* `registerSchema` rejects invalid email; accepts and normalizes case+trim.
* `loginSchema` requires non-empty password.
* `submitExamSchema` rejects missing `examId`/`attemptId`; rejects answer entries without `questionId`; accepts empty answers array.
* `questionSchema` requires non-empty text; defaults `points` to 1.
* `initiatePaymentSchema` rejects unknown payment methods; accepts `card | fawry | wallet`.

### 3.3 `tests/academic-year.test.ts` (9 tests) — [src/lib/academic-year.ts](src/lib/academic-year.ts)

* `normalizeAcademicYear` handles empty/null, maps short aliases (`grade4` → `grade4_primary`, `prep1` → `grade1_prep`, `sec2` → `grade2_secondary`), is case-insensitive, ignores dashes/spaces, leaves canonical values unchanged.
* `isSameAcademicYear` returns true across alias/canonical pairs; false on mismatch or empty input.
* `getAcademicYearVariants` returns canonical + all aliases pointing to it.

### 3.4 `tests/api-helpers.test.ts` (9 tests) — [src/lib/api-helpers.ts](src/lib/api-helpers.ts)

* `escapeRegex` escapes `. * + ? ^ $ ( ) | [ ] { } \`; leaves plain strings alone; coerces non-strings.
* `isValidObjectId` accepts the canonical 24-hex form; rejects other lengths, non-hex characters, and non-strings — **stricter than Mongoose's built-in**, blocking 12-byte-string and numeric bypasses.
* `rateLimit` blocks after `max` requests within window; buckets are per-identifier.

### 3.5 `tests/exam-grading.test.ts` (11 tests) — [src/lib/exam-grading.ts](src/lib/exam-grading.ts)

* MCQ scoring by option `_id` and by option `text`.
* Incorrect MCQ → 0 points.
* Missing answer → 0 points, still recorded in `gradedAnswers`.
* Fill-in-blank case-insensitive, trimmed.
* Empty fill-in-blank answer never grades correct even when `correctAnswer` is also empty.
* Mixed-question score computed correctly.
* `passed = score >= passingScore` boundary.
* `totalPoints === 0` → score 0, passed false.
* `truefalse` scored as single-choice.

## 4. Environment

The test setup file [tests/setup.ts](tests/setup.ts) seeds harmless env defaults so modules that read `process.env` at import-time don't throw:

* `MONGODB_URI` — placeholder; `connectDB()` is never actually called in unit tests.
* `NEXTAUTH_SECRET` — placeholder; not used by unit-tested code paths.
* `CONTENT_SECRET` — 64-character placeholder; satisfies the ≥32 length check in [src/lib/content-token.ts](src/lib/content-token.ts).

## 5. What is **not** covered (gaps & next steps)

The unit layer intentionally does **not** exercise the API route handlers, DB models, or the Paymob webhook — those need live infrastructure. To extend coverage:

1. **API integration tests** — add `supertest` + `mongodb-memory-server` and create `tests/integration/*.test.ts` that boot a Next test handler against an in-memory Mongo. Recommended priority targets:
   * `POST /api/auth/register` — rate limit, weak-password rejection, role hardcoding.
   * `POST /api/exams/[id]/start` and `POST /api/exams/submit` — full grading flow with snapshot.
   * `POST /api/webhooks/paymob` — HMAC verify, idempotency, amount/order checks.
   * `PUT /api/exams/[id]` — IDOR test for course reassignment.
   * `GET /api/content/[token]` — Sec-Fetch enforcement, range streaming, rate limit.

2. **E2E** with Playwright on critical user journeys: register → enroll → take exam → submit → see score.

3. **Negative authorization matrix** generated from a list of (role, route) pairs.

## 6. Bugs caught while writing tests

While extracting the grading logic for testing, no behavior bugs surfaced — the original implementation matched expectations. However, the extraction itself improves robustness: the pure function now explicitly guards against `undefined` fields and the empty-`correctAnswer` edge case (test 7 in `exam-grading.test.ts`).
