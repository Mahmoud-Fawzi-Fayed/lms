import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  submitExamSchema,
  questionSchema,
  courseSchema,
  examSchema,
  initiatePaymentSchema,
  initiateExamPaymentSchema,
} from '@/lib/validations';

const VALID_OBJECT_ID = '60d0fe4f5311236168a109ca';

describe('registerSchema', () => {
  const baseRegistration = {
    name: 'Test User',
    email: 'a@b.com',
    academicYear: 'grade4_primary',
    academicTerm: 'term1',
    subscriptionMethod: 'card',
    agreeToSubscription: true,
  } as const;

  it('rejects password without uppercase', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'password1',
    });
    expect(r.success).toBe(false);
  });

  it('rejects password without lowercase', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'PASSWORD1',
    });
    expect(r.success).toBe(false);
  });

  it('rejects password without digit', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password',
    });
    expect(r.success).toBe(false);
  });

  it('rejects password shorter than 8', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Aa1bcd',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      email: 'not-an-email',
      password: 'Password1',
    });
    expect(r.success).toBe(false);
  });

  it('rejects grade2 secondary if term is not full_year', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
      academicYear: 'grade2_secondary',
      academicTerm: 'term1',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a fully valid registration', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      email: 'A@B.COM',
      password: 'Password1',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // email should be normalized to lowercase + trimmed
      expect(r.data.email).toBe('a@b.com');
    }
  });

  it('accepts valid registration with courseIds (purchase flow)', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
      courseIds: [VALID_OBJECT_ID],
    });
    expect(r.success).toBe(true);
  });

  it('rejects courseIds containing an invalid ObjectId', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
      courseIds: ['not-an-objectid'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects courseIds containing a too-short ObjectId (23 chars)', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
      courseIds: ['60d0fe4f5311236168a109c'],
    });
    expect(r.success).toBe(false);
  });

  it('allows registration without courseIds (account-only flow)', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.courseIds).toBeUndefined();
  });
});


describe('submitExamSchema', () => {
  it('rejects when examId missing', () => {
    const r = submitExamSchema.safeParse({ attemptId: VALID_OBJECT_ID, answers: [] });
    expect(r.success).toBe(false);
  });

  it('rejects when attemptId missing', () => {
    const r = submitExamSchema.safeParse({ examId: VALID_OBJECT_ID, answers: [] });
    expect(r.success).toBe(false);
  });

  it('rejects non-ObjectId examId', () => {
    const r = submitExamSchema.safeParse({ examId: 'not-an-id', attemptId: VALID_OBJECT_ID, answers: [] });
    expect(r.success).toBe(false);
  });

  it('rejects non-ObjectId attemptId', () => {
    const r = submitExamSchema.safeParse({ examId: VALID_OBJECT_ID, attemptId: 'bad', answers: [] });
    expect(r.success).toBe(false);
  });

  it('accepts empty answers array (caller decides)', () => {
    const r = submitExamSchema.safeParse({ examId: VALID_OBJECT_ID, attemptId: VALID_OBJECT_ID, answers: [] });
    expect(r.success).toBe(true);
  });

  it('rejects answers entries without questionId', () => {
    const r = submitExamSchema.safeParse({
      examId: VALID_OBJECT_ID,
      attemptId: VALID_OBJECT_ID,
      answers: [{ selectedOption: 'x' }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts answers with both selectedOption and answer (type-agnostic schema)', () => {
    const r = submitExamSchema.safeParse({
      examId: VALID_OBJECT_ID,
      attemptId: VALID_OBJECT_ID,
      answers: [{ questionId: VALID_OBJECT_ID, selectedOption: 'A', answer: 'also A' }],
    });
    expect(r.success).toBe(true);
  });
});

describe('questionSchema', () => {
  it('requires question text', () => {
    const r = questionSchema.safeParse({ type: 'mcq', text: '', order: 0 });
    expect(r.success).toBe(false);
  });

  it('defaults points to 1', () => {
    const r = questionSchema.safeParse({ type: 'mcq', text: 'Q?', order: 0 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.points).toBe(1);
  });
});

describe('initiatePaymentSchema', () => {
  it('rejects unknown payment method', () => {
    const r = initiatePaymentSchema.safeParse({ courseId: VALID_OBJECT_ID, method: 'paypal' });
    expect(r.success).toBe(false);
  });

  it('rejects non-ObjectId courseId (plain string)', () => {
    const r = initiatePaymentSchema.safeParse({ courseId: 'abc', method: 'card' });
    expect(r.success).toBe(false);
  });

  it('rejects courseId with 23 hex chars (too short)', () => {
    const r = initiatePaymentSchema.safeParse({ courseId: '60d0fe4f5311236168a109c', method: 'card' });
    expect(r.success).toBe(false);
  });

  it('rejects courseId with 25 hex chars (too long)', () => {
    const r = initiatePaymentSchema.safeParse({ courseId: '60d0fe4f5311236168a109cab', method: 'card' });
    expect(r.success).toBe(false);
  });

  it('rejects empty courseId', () => {
    const r = initiatePaymentSchema.safeParse({ courseId: '', method: 'card' });
    expect(r.success).toBe(false);
  });

  it('accepts card/fawry/wallet with a valid 24-hex courseId', () => {
    for (const method of ['card', 'fawry', 'wallet'] as const) {
      const r = initiatePaymentSchema.safeParse({ courseId: VALID_OBJECT_ID, method });
      expect(r.success).toBe(true);
    }
  });

  it('accepts uppercase hex courseId', () => {
    const r = initiatePaymentSchema.safeParse({ courseId: VALID_OBJECT_ID.toUpperCase(), method: 'card' });
    expect(r.success).toBe(true);
  });
});

describe('initiateExamPaymentSchema', () => {
  it('rejects non-ObjectId examId', () => {
    const r = initiateExamPaymentSchema.safeParse({ examId: 'not-an-id', method: 'card' });
    expect(r.success).toBe(false);
  });

  it('rejects examId shorter than 24 hex chars', () => {
    const r = initiateExamPaymentSchema.safeParse({ examId: '60d0fe4f5311236168a109c', method: 'card' });
    expect(r.success).toBe(false);
  });

  it('rejects empty examId', () => {
    const r = initiateExamPaymentSchema.safeParse({ examId: '', method: 'wallet' });
    expect(r.success).toBe(false);
  });

  it('accepts valid 24-hex examId with all methods', () => {
    for (const method of ['card', 'fawry', 'wallet'] as const) {
      const r = initiateExamPaymentSchema.safeParse({ examId: VALID_OBJECT_ID, method });
      expect(r.success).toBe(true);
    }
  });

  it('rejects unknown method for exam payment', () => {
    const r = initiateExamPaymentSchema.safeParse({ examId: VALID_OBJECT_ID, method: 'crypto' });
    expect(r.success).toBe(false);
  });
});

// ── loginSchema ───────────────────────────────────────────────────────────────

describe('loginSchema', () => {
  it('requires a non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });

  it('rejects missing email', () => {
    expect(loginSchema.safeParse({ password: 'Password1' }).success).toBe(false);
  });

  it('rejects non-email string', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  it('normalizes email to lowercase', () => {
    const r = loginSchema.safeParse({ email: 'USER@EXAMPLE.COM', password: 'p' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('user@example.com');
  });

  it('rejects email with surrounding whitespace (trim runs after email check)', () => {
    // Zod applies .email() before .trim(), so padded emails fail validation.
    // Frontend forms should always trim before submitting.
    const r = loginSchema.safeParse({ email: '  user@example.com  ', password: 'p' });
    expect(r.success).toBe(false);
  });
});

// ── courseSchema ──────────────────────────────────────────────────────────────

const baseCourse = {
  title: 'Mathematics Grade 4',
  description: 'A comprehensive course for grade 4 students.',
  price: 100,
  category: 'math',
  level: 'beginner' as const,
} as const;

describe('courseSchema', () => {
  it('accepts a valid minimal course', () => {
    const r = courseSchema.safeParse(baseCourse);
    expect(r.success).toBe(true);
  });

  it('rejects title shorter than 3 characters', () => {
    const r = courseSchema.safeParse({ ...baseCourse, title: 'AB' });
    expect(r.success).toBe(false);
  });

  it('rejects title longer than 200 characters', () => {
    const r = courseSchema.safeParse({ ...baseCourse, title: 'A'.repeat(201) });
    expect(r.success).toBe(false);
  });

  it('rejects description shorter than 10 characters', () => {
    const r = courseSchema.safeParse({ ...baseCourse, description: 'Short' });
    expect(r.success).toBe(false);
  });

  it('rejects negative price', () => {
    const r = courseSchema.safeParse({ ...baseCourse, price: -1 });
    expect(r.success).toBe(false);
  });

  it('accepts price = 0 (free course)', () => {
    const r = courseSchema.safeParse({ ...baseCourse, price: 0 });
    expect(r.success).toBe(true);
  });

  it('rejects invalid level enum', () => {
    const r = courseSchema.safeParse({ ...baseCourse, level: 'expert' });
    expect(r.success).toBe(false);
  });

  it('accepts all valid levels', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      expect(courseSchema.safeParse({ ...baseCourse, level }).success).toBe(true);
    }
  });

  it('rejects discountPrice equal to price', () => {
    const r = courseSchema.safeParse({ ...baseCourse, price: 100, discountPrice: 100 });
    expect(r.success).toBe(false);
  });

  it('rejects discountPrice greater than price', () => {
    const r = courseSchema.safeParse({ ...baseCourse, price: 100, discountPrice: 150 });
    expect(r.success).toBe(false);
  });

  it('accepts discountPrice strictly less than price', () => {
    const r = courseSchema.safeParse({ ...baseCourse, price: 100, discountPrice: 80 });
    expect(r.success).toBe(true);
  });

  it('accepts omitted discountPrice regardless of price', () => {
    const r = courseSchema.safeParse({ ...baseCourse, price: 100 });
    expect(r.success).toBe(true);
  });

  it('rejects empty category', () => {
    const r = courseSchema.safeParse({ ...baseCourse, category: '   ' });
    // category has .trim().min(1), so whitespace-only should fail
    expect(r.success).toBe(false);
  });
});

// ── examSchema ────────────────────────────────────────────────────────────────

const baseExam = {
  title: 'Midterm Exam',
  duration: 60,
  passingScore: 60,
  maxAttempts: 3,
  questions: [
    {
      type: 'mcq' as const,
      text: 'What is 2+2?',
      order: 0,
      options: [
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: true },
      ],
    },
  ],
};

describe('examSchema', () => {
  it('accepts a valid exam', () => {
    const r = examSchema.safeParse(baseExam);
    expect(r.success).toBe(true);
  });

  it('rejects title shorter than 3 characters', () => {
    const r = examSchema.safeParse({ ...baseExam, title: 'AB' });
    expect(r.success).toBe(false);
  });

  it('rejects duration less than 1 minute', () => {
    const r = examSchema.safeParse({ ...baseExam, duration: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects passingScore above 100', () => {
    const r = examSchema.safeParse({ ...baseExam, passingScore: 101 });
    expect(r.success).toBe(false);
  });

  it('rejects maxAttempts less than 1', () => {
    const r = examSchema.safeParse({ ...baseExam, maxAttempts: 0 });
    expect(r.success).toBe(false);
  });

  it('accepts passingScore = 0 (always pass)', () => {
    const r = examSchema.safeParse({ ...baseExam, passingScore: 0 });
    expect(r.success).toBe(true);
  });

  it('accepts passingScore = 100 (perfect required)', () => {
    const r = examSchema.safeParse({ ...baseExam, passingScore: 100 });
    expect(r.success).toBe(true);
  });

  it('rejects paid standalone exam with discountPrice equal to price', () => {
    const r = examSchema.safeParse({
      ...baseExam,
      accessType: 'paid',
      price: 200,
      discountPrice: 200,
    });
    expect(r.success).toBe(false);
  });

  it('rejects paid standalone exam with discountPrice greater than price', () => {
    const r = examSchema.safeParse({
      ...baseExam,
      accessType: 'paid',
      price: 200,
      discountPrice: 300,
    });
    expect(r.success).toBe(false);
  });

  it('accepts paid standalone exam with discountPrice strictly less than price', () => {
    const r = examSchema.safeParse({
      ...baseExam,
      accessType: 'paid',
      price: 200,
      discountPrice: 150,
    });
    expect(r.success).toBe(true);
  });

  it('accepts free exam with any discountPrice (constraint only applies to paid)', () => {
    const r = examSchema.safeParse({
      ...baseExam,
      accessType: 'free',
      price: 0,
      discountPrice: 0,
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid accessType', () => {
    const r = examSchema.safeParse({ ...baseExam, accessType: 'trial' });
    expect(r.success).toBe(false);
  });

  it('rejects questions with empty text', () => {
    const r = examSchema.safeParse({
      ...baseExam,
      questions: [{ type: 'mcq', text: '', order: 0 }],
    });
    expect(r.success).toBe(false);
  });
});
