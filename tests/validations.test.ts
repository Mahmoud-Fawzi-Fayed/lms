import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  submitExamSchema,
  questionSchema,
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

  it('accepts valid registration with a courseId (purchase flow)', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
      courseId: VALID_OBJECT_ID,
    });
    expect(r.success).toBe(true);
  });

  it('rejects courseId that is not a 24-hex ObjectId', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
      courseId: 'not-an-objectid',
    });
    expect(r.success).toBe(false);
  });

  it('rejects courseId that is too short (23 chars)', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
      courseId: '60d0fe4f5311236168a109c',
    });
    expect(r.success).toBe(false);
  });

  it('allows registration without courseId (admin flow, API enforces presence)', () => {
    const r = registerSchema.safeParse({
      ...baseRegistration,
      password: 'Password1',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.courseId).toBeUndefined();
  });
});

describe('loginSchema', () => {
  it('requires a non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('submitExamSchema', () => {
  it('rejects when examId missing', () => {
    const r = submitExamSchema.safeParse({ attemptId: 'a', answers: [] });
    expect(r.success).toBe(false);
  });

  it('rejects when attemptId missing', () => {
    const r = submitExamSchema.safeParse({ examId: 'e', answers: [] });
    expect(r.success).toBe(false);
  });

  it('accepts empty answers array (caller decides)', () => {
    const r = submitExamSchema.safeParse({ examId: 'e', attemptId: 'a', answers: [] });
    expect(r.success).toBe(true);
  });

  it('rejects answers entries without questionId', () => {
    const r = submitExamSchema.safeParse({
      examId: 'e',
      attemptId: 'a',
      answers: [{ selectedOption: 'x' }],
    });
    expect(r.success).toBe(false);
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

