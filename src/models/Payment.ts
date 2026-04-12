import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPayment extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  course?: mongoose.Types.ObjectId;
  exam?: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  method: 'card' | 'fawry' | 'wallet' | 'free';
  // Paymob fields
  paymobOrderId?: string;
  paymobTransactionId?: string;
  paymobToken?: string;
  // Fawry reference for manual payment
  fawryReferenceNumber?: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paidAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
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
    },
    exam: {
      type: Schema.Types.ObjectId,
      ref: 'Exam',
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'EGP' },
    method: {
      type: String,
      enum: ['card', 'fawry', 'wallet', 'free'],
      required: true,
    },
    paymobOrderId: { type: String, index: true },
    paymobTransactionId: { type: String, index: true },
    paymobToken: { type: String },
    fawryReferenceNumber: { type: String },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    paidAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.index({ user: 1, course: 1 });
paymentSchema.index({ user: 1, exam: 1 });

const Payment: Model<IPayment> =
  mongoose.models.Payment ||
  mongoose.model<IPayment>('Payment', paymentSchema);

export default Payment;
