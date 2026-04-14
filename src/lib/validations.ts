import { z } from 'zod';

export const ACADEMIC_YEARS = [
  { value: 'grade4_primary',    label: 'الصف الرابع الابتدائي' },
  { value: 'grade5_primary',    label: 'الصف الخامس الابتدائي' },
  { value: 'grade6_primary',    label: 'الصف السادس الابتدائي' },
  { value: 'grade1_prep',       label: 'الصف الأول الإعدادي' },
  { value: 'grade2_prep',       label: 'الصف الثاني الإعدادي' },
  { value: 'grade3_prep',       label: 'الصف الثالث الإعدادي' },
  { value: 'grade1_secondary',  label: 'الصف الأول الثانوي' },
  { value: 'grade2_secondary',  label: 'الصف الثاني الثانوي' },
] as const;

export type AcademicYear = typeof ACADEMIC_YEARS[number]['value'];

const academicYearValues = ACADEMIC_YEARS.map(y => y.value) as [string, ...string[]];

// Auth Schemas
export const loginSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح').toLowerCase().trim(),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل').max(100).trim(),
  email: z.string().email('البريد الإلكتروني غير صحيح').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Z]/, 'كلمة المرور يجب أن تحتوي على حرف كبير')
    .regex(/[a-z]/, 'كلمة المرور يجب أن تحتوي على حرف صغير')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على رقم'),
  phone: z.string().optional(),
  academicYear: z.enum(academicYearValues as [AcademicYear, ...AcademicYear[]]).optional(),
});

// Course Schemas
export const videoControlsSchema = z.object({
  allowSpeed:      z.boolean().default(true),
  allowSkip:       z.boolean().default(true),
  allowFullscreen: z.boolean().default(true),
  allowSeek:       z.boolean().default(true),
  allowVolume:     z.boolean().default(true),
  forceFocus:      z.boolean().default(false),
}).optional();

export const lessonSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['video', 'pdf', 'text']),
  content: z.string().optional(),
  duration: z.number().min(0).optional(),
  order: z.number().min(0),
  isPreview: z.boolean().default(false),
  videoControls: videoControlsSchema,
});

export const moduleSchema = z.object({
  title: z.string().min(1).max(200),
  order: z.number().min(0),
  lessons: z.array(lessonSchema),
});

export const courseSchema = z.object({
  title: z.string().min(3, 'العنوان يجب أن يكون 3 أحرف على الأقل').max(200),
  description: z.string().min(10, 'الوصف يجب أن يكون 10 أحرف على الأقل'),
  shortDescription: z.string().max(300).optional(),
  price: z.number().min(0, 'السعر يجب أن يكون رقمًا موجبًا أو صفرًا'),
  discountPrice: z.number().min(0).optional(),
  category: z.string().trim().min(1, 'التصنيف مطلوب'),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  language: z.string().default('ar'),
  targetYear: z.enum(academicYearValues as [AcademicYear, ...AcademicYear[]]).optional(),
  tags: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional(),
  whatYouLearn: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
  modules: z.array(z.object({
    title: z.string().min(1).max(200),
    order: z.number().min(0),
    lessons: z.array(z.object({
      title: z.string().min(1).max(200),
      type: z.enum(['video', 'pdf', 'text']),
      content: z.string().optional(),
      duration: z.number().min(0).default(0),
      order: z.number().min(0),
      isPreview: z.boolean().default(false),
      videoControls: videoControlsSchema,
    })),
  })).optional(),
});

// Exam Schemas
export const questionSchema = z.object({
  type: z.enum(['mcq', 'truefalse', 'fillinblank', 'single']),
  text: z.string().min(1, 'نص السؤال مطلوب'),
  options: z
    .array(
      z.object({
        text: z.string().min(1),
        isCorrect: z.boolean(),
      })
    )
    .optional(),
  correctAnswer: z.string().optional(),
  points: z.number().min(0).default(1),
  explanation: z.string().optional(),
  order: z.number().min(0),
});

export const examSchema = z.object({
  title: z.string().min(3).max(200),
  course: z.string().optional(),
  targetYear: z.enum(academicYearValues as [AcademicYear, ...AcademicYear[]]).optional(),
  description: z.string().optional(),
  price: z.number().min(0).default(0),
  discountPrice: z.number().min(0).optional(),
  accessType: z.enum(['free', 'paid']).default('free'),
  duration: z.number().min(1, 'مدة الاختبار يجب ألا تقل عن دقيقة واحدة'),
  passingScore: z.number().min(0).max(100).default(60),
  maxAttempts: z.number().min(1).default(3),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showResults: z.boolean().default(true),
  isPreview: z.boolean().default(false),
  questions: z.array(questionSchema),
});

// Exam Submit Schema
export const submitExamSchema = z.object({
  examId: z.string().min(1),
  attemptId: z.string().min(1),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedOption: z.string().optional(),
      answer: z.string().optional(),
    })
  ),
});

// Payment Schema
export const initiatePaymentSchema = z.object({
  courseId: z.string().min(1),
  method: z.enum(['card', 'fawry', 'wallet']),
});

export const initiateExamPaymentSchema = z.object({
  examId: z.string().min(1),
  method: z.enum(['card', 'fawry', 'wallet']),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type ExamInput = z.infer<typeof examSchema>;
export type SubmitExamInput = z.infer<typeof submitExamSchema>;
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type InitiateExamPaymentInput = z.infer<typeof initiateExamPaymentSchema>;
