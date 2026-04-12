import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IQuestion {
  _id: mongoose.Types.ObjectId;
  type: 'mcq' | 'single' | 'truefalse' | 'fillinblank';
  text: string;
  options?: { text: string; isCorrect: boolean }[];
  correctAnswer?: string; // For fill in blank
  points: number;
  explanation?: string;
  order: number;
}

export interface IExam extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  course?: mongoose.Types.ObjectId;
  targetYear: string;
  createdBy?: mongoose.Types.ObjectId;
  description?: string;
  price: number;
  discountPrice?: number;
  accessType: 'free' | 'paid';
  duration: number; // In minutes
  passingScore: number; // Percentage 0-100
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResults: boolean; // Show correct answers after submission
  isPublished: boolean;
  questions: IQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>({
  type: {
    type: String,
    enum: ['mcq', 'truefalse', 'fillinblank', 'single'],
    required: true,
  },
  text: { type: String, required: true },
  options: [
    {
      text: { type: String, required: true },
      isCorrect: { type: Boolean, required: true },
    },
  ],
  correctAnswer: { type: String }, // For fill-in-blank
  points: { type: Number, required: true, default: 1, min: 0 },
  explanation: { type: String },
  order: { type: Number, required: true },
});

const examSchema = new Schema<IExam>(
  {
    title: { type: String, required: true, trim: true },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      index: true,
    },
    targetYear: { type: String, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    description: { type: String },
    price: { type: Number, required: true, default: 0, min: 0 },
    discountPrice: { type: Number, min: 0 },
    accessType: {
      type: String,
      enum: ['free', 'paid'],
      default: 'free',
      index: true,
    },
    duration: { type: Number, required: true, min: 1 }, // minutes
    passingScore: { type: Number, required: true, default: 60, min: 0, max: 100 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    showResults: { type: Boolean, default: true },
    isPublished: { type: Boolean, default: false },
    questions: [questionSchema],
  },
  { timestamps: true }
);

examSchema.index({ course: 1, isPublished: 1 });
examSchema.index({ targetYear: 1, isPublished: 1 });
examSchema.index({ accessType: 1, isPublished: 1 });

const Exam: Model<IExam> =
  mongoose.models.Exam || mongoose.model<IExam>('Exam', examSchema);

export default Exam;
