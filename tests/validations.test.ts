import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  submitExamSchema,
  questionSchema,
  initiatePaymentSchema,
} from '@/lib/validations';

describe('registerSchema', () => {
  it('rejects password without uppercase', () => {
    const r = registerSchema.safeParse({
      name: 'Test User',
      email: 'a@b.com',
      password: 'password1',
    });
    expect(r.success).toBe(false);
  });

  it('rejects password without lowercase', () => {
    const r = registerSchema.safeParse({
      name: 'Test User',
      email: 'a@b.com',
      password: 'PASSWORD1',
    });
    expect(r.success).toBe(false);
  });

  it('rejects password without digit', () => {
    const r = registerSchema.safeParse({
      name: 'Test User',
      email: 'a@b.com',
      password: 'Password',
    });
    expect(r.success).toBe(false);
  });

  it('rejects password shorter than 8', () => {
    const r = registerSchema.safeParse({
      name: 'Test User',
      email: 'a@b.com',
      password: 'Aa1bcd',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const r = registerSchema.safeParse({
      name: 'Test User',
      email: 'not-an-email',
      password: 'Password1',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a fully valid registration', () => {
    const r = registerSchema.safeParse({
      name: 'Test User',
      email: 'A@B.COM',
      password: 'Password1',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // email should be normalized to lowercase + trimmed
      expect(r.data.email).toBe('a@b.com');
    }
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
  it('rejects unknown payment method (no plain "paypal")', () => {
    const r = initiatePaymentSchema.safeParse({ courseId: 'c1', method: 'paypal' });
    expect(r.success).toBe(false);
  });

  it('accepts card/fawry/wallet', () => {
    for (const method of ['card', 'fawry', 'wallet'] as const) {
      const r = initiatePaymentSchema.safeParse({ courseId: 'c1', method });
      expect(r.success).toBe(true);
    }
  });
});
