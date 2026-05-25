import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * ContentAccess — append-only audit log of every successful content fetch.
 *
 * Used for:
 *  - Forensics: when a leaked file surfaces, query by lessonId to find candidate leakers
 *  - Anomaly detection: spotting a single user fetching dozens of lessons in minutes
 *  - Compliance: proving who accessed what and when
 *
 * Indexed by user+ts and lesson+ts for fast point lookups during incident response.
 */
export interface IContentAccess extends Document {
  user: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  lesson: mongoose.Types.ObjectId;
  mode: 'raw' | 'stream';
  ip: string;
  userAgent: string;
  bytes?: number;
  createdAt: Date;
}

const contentAccessSchema = new Schema<IContentAccess>(
  {
    user:      { type: Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
    course:    { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    lesson:    { type: Schema.Types.ObjectId,                required: true, index: true },
    mode:      { type: String, enum: ['raw', 'stream'], required: true },
    ip:        { type: String, default: '' },
    userAgent: { type: String, default: '' },
    bytes:     { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL: auto-purge audit rows after 180 days (configurable per compliance need).
contentAccessSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });
contentAccessSchema.index({ user: 1, createdAt: -1 });
contentAccessSchema.index({ lesson: 1, createdAt: -1 });

const ContentAccess: Model<IContentAccess> =
  (mongoose.models.ContentAccess as Model<IContentAccess>) ||
  mongoose.model<IContentAccess>('ContentAccess', contentAccessSchema);

export default ContentAccess;
