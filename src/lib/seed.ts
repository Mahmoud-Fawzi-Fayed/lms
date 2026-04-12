import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './db';
import { User, Course, Exam, ExamAttempt, Enrollment, Payment } from '../models';

const ACCOUNTS = {
  admin: {
    name: 'Admin User',
    email: 'admin@lms.com',
    password: 'Admin1234',
    role: 'admin' as const,
  },
  instructor: {
    name: 'Instructor User',
    email: 'instructor@lms.com',
    password: 'Instructor1234',
    role: 'instructor' as const,
  },
  studentG4: {
    name: 'Student Grade 4',
    email: 'student.g4@lms.com',
    password: 'Student1234',
    role: 'student' as const,
    academicYear: 'grade4_primary',
  },
  studentG5: {
    name: 'Student Grade 5',
    email: 'student.g5@lms.com',
    password: 'Student1234',
    role: 'student' as const,
    academicYear: 'grade5_primary',
  },
  studentPrep1: {
    name: 'Student Prep 1',
    email: 'student.prep1@lms.com',
    password: 'Student1234',
    role: 'student' as const,
    academicYear: 'grade1_prep',
  },
  studentEnrolled: {
    name: 'Student Enrolled Grade 4',
    email: 'student.enrolled@lms.com',
    password: 'Student1234',
    role: 'student' as const,
    academicYear: 'grade4_primary',
  },
};

async function upsertUser(data: {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'instructor' | 'student';
  academicYear?: string;
}) {
  let user = await User.findOne({ email: data.email }).select('+password');
  if (!user) {
    user = new User(data as any);
  } else {
    user.name = data.name;
    user.role = data.role;
    user.academicYear = data.academicYear;
    user.password = data.password;
    user.isActive = true;
    user.isEmailVerified = true;
  }

  await user.save();
  return user;
}

async function run() {
  await connectDB();

  console.log('Seeding users...');
  const admin = await upsertUser(ACCOUNTS.admin);
  const instructor = await upsertUser(ACCOUNTS.instructor);
  const studentG4 = await upsertUser(ACCOUNTS.studentG4);
  const studentG5 = await upsertUser(ACCOUNTS.studentG5);
  const studentPrep1 = await upsertUser(ACCOUNTS.studentPrep1);
  const studentEnrolled = await upsertUser(ACCOUNTS.studentEnrolled);

  console.log('Seeding courses...');
  const course1 = await Course.findOneAndUpdate(
    { slug: 'seed-intro-js' },
    {
      title: 'Seed | مقدمة في البرمجة',
      slug: 'seed-intro-js',
      description: 'كورس تجريبي للصف الرابع الابتدائي.',
      shortDescription: 'أساسيات البرمجة للمبتدئين',
      instructor: instructor._id,
      price: 500,
      discountPrice: 300,
      category: 'programming',
      targetYear: 'grade4_primary',
      level: 'beginner',
      language: 'ar',
      isPublished: true,
      tags: ['javascript', 'beginner'],
      requirements: ['لا يوجد'],
      whatYouLearn: ['أساسيات JavaScript', 'التفكير المنطقي'],
      modules: [
        {
          title: 'الوحدة الأولى',
          order: 0,
          lessons: [
            {
              title: 'مقدمة',
              type: 'text',
              content: 'مرحباً بك في الكورس التجريبي.',
              duration: 10,
              order: 0,
              isPreview: true,
            },
            {
              title: 'المتغيرات',
              type: 'text',
              content: 'شرح المتغيرات وأنواع البيانات.',
              duration: 15,
              order: 1,
              isPreview: false,
            },
          ],
        },
      ],
      enrollmentCount: 0,
      rating: 4.5,
      ratingCount: 12,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const course2 = await Course.findOneAndUpdate(
    { slug: 'seed-algebra-prep1' },
    {
      title: 'Seed | جبر إعدادي أولى',
      slug: 'seed-algebra-prep1',
      description: 'كورس تجريبي لطلاب أولى إعدادي.',
      shortDescription: 'الجبر للمستوى الإعدادي',
      instructor: instructor._id,
      price: 650,
      category: 'math',
      targetYear: 'grade1_prep',
      level: 'intermediate',
      language: 'ar',
      isPublished: true,
      tags: ['math', 'algebra'],
      requirements: ['إتقان العمليات الحسابية'],
      whatYouLearn: ['المعادلات', 'التحليل'],
      modules: [
        {
          title: 'الجبر الأساسي',
          order: 0,
          lessons: [
            {
              title: 'المعادلات البسيطة',
              type: 'text',
              content: 'حل المعادلات خطوة بخطوة.',
              duration: 20,
              order: 0,
              isPreview: true,
            },
          ],
        },
      ],
      enrollmentCount: 0,
      rating: 4.2,
      ratingCount: 8,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const course3 = await Course.findOneAndUpdate(
    { slug: 'seed-draft-hidden' },
    {
      title: 'Seed | كورس مسودة غير منشور',
      slug: 'seed-draft-hidden',
      description: 'مسودة لا يجب أن تظهر للطلاب.',
      shortDescription: 'Draft course',
      instructor: instructor._id,
      price: 400,
      category: 'science',
      targetYear: 'grade5_primary',
      level: 'beginner',
      language: 'ar',
      isPublished: false,
      modules: [],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const course4 = await Course.findOneAndUpdate(
    { slug: 'seed-free-grade4' },
    {
      title: 'Seed | كورس مجاني للصف الرابع',
      slug: 'seed-free-grade4',
      description: 'كورس مجاني لاختبار الوصول المجاني.',
      shortDescription: 'مثال على كورس مجاني',
      instructor: instructor._id,
      price: 0,
      category: 'programming',
      targetYear: 'grade4_primary',
      level: 'beginner',
      language: 'ar',
      isPublished: true,
      tags: ['free', 'beginner'],
      requirements: ['لا يوجد'],
      whatYouLearn: ['الوصول المجاني', 'اختبار التسجيل'],
      modules: [
        {
          title: 'الوحدة المجانية',
          order: 0,
          lessons: [
            {
              title: 'الدرس المجاني الأول',
              type: 'text',
              content: 'هذا درس مجاني متاح للمشتركين في الكورس المجاني.',
              duration: 8,
              order: 0,
              isPreview: true,
            },
          ],
        },
      ],
      enrollmentCount: 0,
      rating: 4.8,
      ratingCount: 4,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('Seeding exams...');
  const exam1 = await Exam.findOneAndUpdate(
    { title: 'Seed | اختبار مقدمة البرمجة (مرتبط بكورس)' },
    {
      title: 'Seed | اختبار مقدمة البرمجة (مرتبط بكورس)',
      description: 'اختبار شامل على الوحدة الأولى.',
      course: course1._id,
      targetYear: 'grade4_primary',
      createdBy: instructor._id,
      duration: 30,
      passingScore: 60,
      maxAttempts: 3,
      shuffleQuestions: false,
      shuffleOptions: false,
      showResults: true,
      isPublished: true,
      questions: [
        {
          type: 'mcq',
          text: 'ما هو نوع بيانات 10 في JavaScript؟',
          options: [
            { text: 'number', isCorrect: true },
            { text: 'string', isCorrect: false },
            { text: 'boolean', isCorrect: false },
            { text: 'object', isCorrect: false },
          ],
          points: 2,
          explanation: 'القيمة 10 هي number.',
          order: 0,
        },
        {
          type: 'truefalse',
          text: 'يمكن إعادة إسناد متغير const.',
          options: [
            { text: 'صح', isCorrect: false },
            { text: 'خطأ', isCorrect: true },
          ],
          points: 1,
          explanation: 'const لا يمكن إعادة إسناده.',
          order: 1,
        },
        {
          type: 'fillinblank',
          text: 'أكمل: الأمر المستخدم للطباعة في JavaScript هو ____.',
          correctAnswer: 'console.log',
          points: 2,
          order: 2,
        },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const exam2 = await Exam.findOneAndUpdate(
    { title: 'Seed | اختبار مستقل للصف الرابع' },
    {
      title: 'Seed | اختبار مستقل للصف الرابع',
      description: 'اختبار مستقل بدون كورس.',
      course: undefined,
      targetYear: 'grade4_primary',
      createdBy: instructor._id,
      duration: 15,
      passingScore: 70,
      maxAttempts: 2,
      shuffleQuestions: true,
      shuffleOptions: true,
      showResults: false,
      isPublished: true,
      questions: [
        {
          type: 'single',
          text: 'أي مما يلي يعد لغة برمجة؟',
          options: [
            { text: 'JavaScript', isCorrect: true },
            { text: 'HTML', isCorrect: false },
            { text: 'CSS', isCorrect: false },
          ],
          points: 1,
          order: 0,
        },
        {
          type: 'mcq',
          text: 'أي دالة تستخدم لتحويل النص إلى رقم؟',
          options: [
            { text: 'parseInt', isCorrect: true },
            { text: 'toString', isCorrect: false },
            { text: 'join', isCorrect: false },
          ],
          points: 1,
          order: 1,
        },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const exam3 = await Exam.findOneAndUpdate(
    { title: 'Seed | اختبار جبر أولى إعدادي' },
    {
      title: 'Seed | اختبار جبر أولى إعدادي',
      description: 'اختبار خاص بأولى إعدادي.',
      course: course2._id,
      targetYear: 'grade1_prep',
      createdBy: instructor._id,
      duration: 20,
      passingScore: 50,
      maxAttempts: 1,
      shuffleQuestions: false,
      shuffleOptions: true,
      showResults: true,
      isPublished: true,
      questions: [
        {
          type: 'mcq',
          text: 'ناتج 2x عندما x = 4؟',
          options: [
            { text: '8', isCorrect: true },
            { text: '6', isCorrect: false },
          ],
          points: 2,
          order: 0,
        },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const examDraft = await Exam.findOneAndUpdate(
    { title: 'Seed | اختبار مسودة غير منشور' },
    {
      title: 'Seed | اختبار مسودة غير منشور',
      description: 'لا يجب أن يظهر للطالب.',
      course: course3._id,
      targetYear: 'grade5_primary',
      createdBy: instructor._id,
      duration: 10,
      passingScore: 60,
      maxAttempts: 1,
      shuffleQuestions: false,
      shuffleOptions: false,
      showResults: true,
      isPublished: false,
      questions: [
        {
          type: 'truefalse',
          text: 'هذا اختبار منشور.',
          options: [
            { text: 'صح', isCorrect: false },
            { text: 'خطأ', isCorrect: true },
          ],
          points: 1,
          order: 0,
        },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('Seeding enrollments and payments...');
  const paidPayment = await Payment.findOneAndUpdate(
    { user: studentEnrolled._id, course: course1._id, method: 'card' },
    {
      user: studentEnrolled._id,
      course: course1._id,
      amount: 300,
      currency: 'EGP',
      method: 'card',
      status: 'paid',
      paidAt: new Date(),
      paymobOrderId: 'seed-order-001',
      paymobTransactionId: 'seed-tx-001',
      metadata: { source: 'seed' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const pendingPayment = await Payment.findOneAndUpdate(
    { user: studentG5._id, course: course1._id, method: 'wallet' },
    {
      user: studentG5._id,
      course: course1._id,
      amount: 300,
      currency: 'EGP',
      method: 'wallet',
      status: 'pending',
      metadata: { source: 'seed' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const failedPayment = await Payment.findOneAndUpdate(
    { user: studentPrep1._id, course: course2._id, method: 'fawry' },
    {
      user: studentPrep1._id,
      course: course2._id,
      amount: 650,
      currency: 'EGP',
      method: 'fawry',
      status: 'failed',
      fawryReferenceNumber: 'seed-fawry-001',
      metadata: { source: 'seed' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Enrollment.findOneAndUpdate(
    { user: studentEnrolled._id, course: course1._id },
    {
      user: studentEnrolled._id,
      course: course1._id,
      payment: paidPayment._id,
      status: 'active',
      progress: {
        completedLessons: [
          course1.modules?.[0]?.lessons?.[0]?._id,
        ].filter(Boolean) as mongoose.Types.ObjectId[],
        lastLesson: course1.modules?.[0]?.lessons?.[0]?._id,
        percentage: 50,
      },
      enrolledAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Enrollment.findOneAndDelete({ user: studentG4._id, course: course1._id });
  await Payment.deleteMany({ user: studentG4._id, course: course1._id });

  const freePayment = await Payment.findOneAndUpdate(
    { user: studentG4._id, course: course4._id, method: 'free' },
    {
      user: studentG4._id,
      course: course4._id,
      amount: 0,
      currency: 'EGP',
      method: 'free',
      status: 'paid',
      paidAt: new Date(),
      metadata: { source: 'seed' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Enrollment.findOneAndUpdate(
    { user: studentG4._id, course: course4._id },
    {
      user: studentG4._id,
      course: course4._id,
      payment: freePayment._id,
      status: 'active',
      progress: { completedLessons: [], percentage: 0 },
      enrolledAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Enrollment.findOneAndUpdate(
    { user: studentG5._id, course: course1._id },
    {
      user: studentG5._id,
      course: course1._id,
      payment: pendingPayment._id,
      status: 'pending',
      progress: { completedLessons: [], percentage: 0 },
      enrolledAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Enrollment.findOneAndUpdate(
    { user: studentPrep1._id, course: course2._id },
    {
      user: studentPrep1._id,
      course: course2._id,
      payment: failedPayment._id,
      status: 'cancelled',
      progress: { completedLessons: [], percentage: 0 },
      enrolledAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('Seeding attempts (submitted, timed-out, in-progress)...');
  await ExamAttempt.deleteMany({
    user: { $in: [studentG4._id, studentG5._id, studentPrep1._id, studentEnrolled._id] },
    exam: { $in: [exam1._id, exam2._id, exam3._id, examDraft._id] },
  });

  await ExamAttempt.insertMany([
    {
      user: studentEnrolled._id,
      exam: exam1._id,
      course: course1._id,
      answers: [
        { question: exam1.questions[0]._id, selectedOption: 'number', isCorrect: true, points: 2 },
        { question: exam1.questions[1]._id, selectedOption: 'خطأ', isCorrect: true, points: 1 },
        { question: exam1.questions[2]._id, answer: 'console.log', isCorrect: true, points: 2 },
      ],
      score: 100,
      totalPoints: 5,
      earnedPoints: 5,
      passed: true,
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
      submittedAt: new Date(Date.now() - 10 * 60 * 1000),
      timeSpent: 300,
      status: 'submitted',
      attemptNumber: 1,
    },
    {
      user: studentG5._id,
      exam: exam1._id,
      course: course1._id,
      answers: [
        { question: exam1.questions[0]._id, selectedOption: 'string', isCorrect: false, points: 0 },
        { question: exam1.questions[1]._id, selectedOption: 'صح', isCorrect: false, points: 0 },
      ],
      score: 0,
      totalPoints: 5,
      earnedPoints: 0,
      passed: false,
      startedAt: new Date(Date.now() - 40 * 60 * 1000),
      submittedAt: new Date(Date.now() - 5 * 60 * 1000),
      timeSpent: 1800,
      status: 'timed-out',
      attemptNumber: 1,
    },
    {
      user: studentPrep1._id,
      exam: exam3._id,
      course: course2._id,
      answers: [],
      score: 0,
      totalPoints: 2,
      earnedPoints: 0,
      passed: false,
      startedAt: new Date(Date.now() - 2 * 60 * 1000),
      timeSpent: 120,
      status: 'in-progress',
      attemptNumber: 1,
    },
  ]);

  await Course.findByIdAndUpdate(course1._id, { enrollmentCount: 2 });
  await Course.findByIdAndUpdate(course2._id, { enrollmentCount: 1 });
  await Course.findByIdAndUpdate(course4._id, { enrollmentCount: 1 });

  console.log('Seed completed successfully.');
  console.log('----------------------------------------------');
  console.log('Admin     : admin@lms.com / Admin1234');
  console.log('Instructor: instructor@lms.com / Instructor1234');
  console.log('Student G4: student.g4@lms.com / Student1234');
  console.log('Student G5: student.g5@lms.com / Student1234');
  console.log('Student P1: student.prep1@lms.com / Student1234');
  console.log('Student Enr: student.enrolled@lms.com / Student1234');
  console.log('----------------------------------------------');

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('Seed failed:', err);
  try {
    await mongoose.connection.close();
  } catch {
    // ignore close errors
  }
  process.exit(1);
});
