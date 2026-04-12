import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEnrollment extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  payment?: mongoose.Types.ObjectId;
  status: 'active' | 'expired' | 'pending' | 'cancelled';
  progress: {
    completedLessons: mongoose.Types.ObjectId[];
    lastLesson?: mongoose.Types.ObjectId;
    percentage: number;
  };
  enrolledAt: Date;
  expiresAt?: Date;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    payment: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'pending', 'cancelled'],
      default: 'pending',
    },
    progress: {
      completedLessons: [{ type: Schema.Types.ObjectId }],
      lastLesson: { type: Schema.Types.ObjectId },
      percentage: { type: Number, default: 0, min: 0, max: 100 },
    },
    enrolledAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ status: 1 });

const Enrollment: Model<IEnrollment> =
  mongoose.models.Enrollment ||
  mongoose.model<IEnrollment>('Enrollment', enrollmentSchema);

export default Enrollment;
