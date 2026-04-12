import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExamEnrollment extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  exam: mongoose.Types.ObjectId;
  payment?: mongoose.Types.ObjectId;
  status: 'active' | 'pending' | 'cancelled';
  enrolledAt: Date;
}

const examEnrollmentSchema = new Schema<IExamEnrollment>(
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
    payment: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'cancelled'],
      default: 'pending',
      index: true,
    },
    enrolledAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

examEnrollmentSchema.index({ user: 1, exam: 1 }, { unique: true });

const ExamEnrollment: Model<IExamEnrollment> =
  mongoose.models.ExamEnrollment ||
  mongoose.model<IExamEnrollment>('ExamEnrollment', examEnrollmentSchema);

export default ExamEnrollment;
