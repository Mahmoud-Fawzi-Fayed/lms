import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAnswer {
  question: mongoose.Types.ObjectId;
  selectedOption?: string; // Index or text of selected option
  answer?: string; // For fill in blank
  isCorrect: boolean;
  points: number;
}

export interface IExamAttempt extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  course?: mongoose.Types.ObjectId;
  answers: IAnswer[];
  score: number; // Percentage
  totalPoints: number;
  earnedPoints: number;
  passed: boolean;
  startedAt: Date;
  submittedAt?: Date;
  timeSpent: number; // seconds
  status: 'in-progress' | 'submitted' | 'timed-out';
  attemptNumber: number;
}

const answerSchema = new Schema<IAnswer>({
  question: { type: Schema.Types.ObjectId, required: true },
  selectedOption: { type: String },
  answer: { type: String },
  isCorrect: { type: Boolean, required: true, default: false },
  points: { type: Number, default: 0 },
});

const examAttemptSchema = new Schema<IExamAttempt>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    exam: {
      type: Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
    },
    answers: [answerSchema],
    score: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    earnedPoints: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    timeSpent: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['in-progress', 'submitted', 'timed-out'],
      default: 'in-progress',
    },
    attemptNumber: { type: Number, required: true, default: 1 },
  },
  { timestamps: true }
);

examAttemptSchema.index({ user: 1, exam: 1 });
examAttemptSchema.index({ exam: 1, score: -1 }); // For leaderboard
examAttemptSchema.index({ course: 1, user: 1 });

const ExamAttempt: Model<IExamAttempt> =
  mongoose.models.ExamAttempt ||
  mongoose.model<IExamAttempt>('ExamAttempt', examAttemptSchema);

export default ExamAttempt;
