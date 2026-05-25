// Test data factories. Mongoose models pre-validate, so we use minimum-required fields.
// All functions return saved documents.

import mongoose from 'mongoose';
import { User, Course, Enrollment, Payment, Exam, ExamAttempt } from '@/models';

let seq = 0;
const uniq = (prefix = '') => `${prefix}${++seq}-${Date.now().toString(36)}`;

export async function makeUser(opts: {
  role?: 'admin' | 'instructor' | 'student';
  name?: string;
  email?: string;
  academicYear?: string;
  isActive?: boolean;
} = {}) {
  const role = opts.role ?? 'student';
  return User.create({
    name: opts.name ?? `${role}-${uniq()}`,
    email: opts.email ?? `${role}-${uniq()}@test.io`.toLowerCase(),
    password: 'Password1', // pre-save hook will hash
    role,
    academicYear: opts.academicYear,
    isActive: opts.isActive ?? true,
  });
}

export async function makeCourse(opts: {
  instructor: mongoose.Types.ObjectId | string;
  title?: string;
  price?: number;
  level?: 'beginner' | 'intermediate' | 'advanced';
  category?: string;
  isPublished?: boolean;
  targetYear?: string;
  enrollmentCount?: number;
} & Partial<Record<string, any>>) {
  const title = opts.title ?? `Course-${uniq()}`;
  return Course.create({
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-') + '-' + uniq(),
    description: 'A test course description with enough length to pass validation.',
    instructor: opts.instructor,
    price: opts.price ?? 0,
    category: opts.category ?? 'general',
    level: opts.level ?? 'beginner',
    language: 'ar',
    targetYear: opts.targetYear,
    isPublished: opts.isPublished ?? true,
    enrollmentCount: opts.enrollmentCount ?? 0,
    modules: [],
  });
}

export async function makeEnrollment(opts: {
  user: mongoose.Types.ObjectId | string;
  course: mongoose.Types.ObjectId | string;
  payment?: mongoose.Types.ObjectId | string;
  status?: 'active' | 'expired' | 'pending' | 'cancelled';
  progress?: number; // 0-100
  enrolledAt?: Date;
}) {
  return Enrollment.create({
    user: opts.user,
    course: opts.course,
    payment: opts.payment,
    status: opts.status ?? 'active',
    progress: { completedLessons: [], percentage: opts.progress ?? 0 },
    enrolledAt: opts.enrolledAt ?? new Date(),
  });
}

export async function makePayment(opts: {
  user: mongoose.Types.ObjectId | string;
  course?: mongoose.Types.ObjectId | string;
  exam?: mongoose.Types.ObjectId | string;
  amount: number;
  method?: 'card' | 'fawry' | 'wallet' | 'free';
  status?: 'pending' | 'paid' | 'failed' | 'refunded';
  paymobTransactionId?: string;
  createdAt?: Date;
}) {
  const doc = await Payment.create({
    user: opts.user,
    course: opts.course,
    exam: opts.exam,
    amount: opts.amount,
    method: opts.method ?? 'card',
    status: opts.status ?? 'paid',
    paymobTransactionId: opts.paymobTransactionId ?? uniq('txn-'),
    paidAt: (opts.status ?? 'paid') === 'paid' ? new Date() : undefined,
  });
  if (opts.createdAt) {
    await Payment.updateOne({ _id: doc._id }, { $set: { createdAt: opts.createdAt } });
    doc.createdAt = opts.createdAt;
  }
  return doc;
}

export async function makeExam(opts: {
  createdBy: mongoose.Types.ObjectId | string;
  course?: mongoose.Types.ObjectId | string;
  title?: string;
  accessType?: 'free' | 'paid';
  price?: number;
  isPublished?: boolean;
  passingScore?: number;
  targetYear?: string;
}) {
  return Exam.create({
    title: opts.title ?? `Exam-${uniq()}`,
    createdBy: opts.createdBy,
    course: opts.course,
    targetYear: opts.targetYear ?? 'grade1_secondary',
    accessType: opts.accessType ?? 'free',
    price: opts.price ?? 0,
    duration: 30,
    passingScore: opts.passingScore ?? 60,
    maxAttempts: 3,
    isPublished: opts.isPublished ?? true,
    questions: [
      {
        type: 'mcq',
        text: 'Q1',
        options: [
          { text: 'A', isCorrect: false },
          { text: 'B', isCorrect: true },
        ],
        points: 1,
        order: 0,
      },
    ],
  });
}

export async function makeAttempt(opts: {
  user: mongoose.Types.ObjectId | string;
  exam: mongoose.Types.ObjectId | string;
  status?: 'in-progress' | 'submitted' | 'timed-out';
  score?: number;
  passed?: boolean;
  attemptNumber?: number;
  createdAt?: Date;
}) {
  const doc = await ExamAttempt.create({
    user: opts.user,
    exam: opts.exam,
    status: opts.status ?? 'submitted',
    score: opts.score ?? 0,
    totalPoints: 1,
    earnedPoints: opts.score && opts.score >= 100 ? 1 : 0,
    passed: opts.passed ?? false,
    attemptNumber: opts.attemptNumber ?? 1,
    startedAt: new Date(),
    submittedAt: (opts.status ?? 'submitted') !== 'in-progress' ? new Date() : undefined,
  });
  if (opts.createdAt) {
    await ExamAttempt.updateOne({ _id: doc._id }, { $set: { createdAt: opts.createdAt } });
    doc.createdAt = opts.createdAt;
  }
  return doc;
}
