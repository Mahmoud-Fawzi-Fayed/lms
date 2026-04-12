import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVideoControls {
  allowSpeed: boolean;
  allowSkip: boolean;
  allowFullscreen: boolean;
  allowSeek: boolean;
  allowVolume: boolean;
  forceFocus: boolean;
}

export interface ILesson {
  _id: mongoose.Types.ObjectId;
  title: string;
  type: 'video' | 'pdf' | 'text';
  content?: string; // For text type
  fileUrl?: string; // For video/pdf
  filePath?: string; // Server-side path (never exposed to client)
  duration?: number; // In seconds for videos
  order: number;
  isPreview: boolean; // Free preview lesson
  videoControls?: IVideoControls;
}

export interface IModule {
  _id: mongoose.Types.ObjectId;
  title: string;
  order: number;
  lessons: ILesson[];
}

export interface ICourse extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  shortDescription?: string;
  thumbnail?: string;
  instructor: mongoose.Types.ObjectId;
  price: number;
  discountPrice?: number;
  category: string;
  targetYear?: string;  // Academic year this course targets (e.g. grade4_primary)
  level: 'beginner' | 'intermediate' | 'advanced';
  language: string;
  modules: IModule[];
  isPublished: boolean;
  enrollmentCount: number;
  rating: number;
  ratingCount: number;
  tags: string[];
  requirements: string[];
  whatYouLearn: string[];
  createdAt: Date;
  updatedAt: Date;
}

const videoControlsSchema = new Schema<IVideoControls>({
  allowSpeed:      { type: Boolean, default: true },
  allowSkip:       { type: Boolean, default: true },
  allowFullscreen: { type: Boolean, default: true },
  allowSeek:       { type: Boolean, default: true },
  allowVolume:     { type: Boolean, default: true },
  forceFocus:      { type: Boolean, default: false },
}, { _id: false });

const lessonSchema = new Schema<ILesson>({
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ['video', 'pdf', 'text'], required: true },
  content: { type: String }, // Rich text content for text lessons
  fileUrl: { type: String }, // Signed/tokenized URL (generated dynamically)
  filePath: { type: String, select: false }, // Actual file path - NEVER exposed
  duration: { type: Number, default: 0 },
  order: { type: Number, required: true },
  isPreview: { type: Boolean, default: false },
  videoControls: { type: videoControlsSchema, default: () => ({}) },
});

const moduleSchema = new Schema<IModule>({
  title: { type: String, required: true, trim: true },
  order: { type: Number, required: true },
  lessons: [lessonSchema],
});

const courseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true },
    shortDescription: { type: String, maxlength: 300 },
    thumbnail: { type: String },
    instructor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    category: { type: String, required: true, index: true },
    targetYear: { type: String, index: true },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    language: { type: String, default: 'ar' },
    modules: [moduleSchema],
    isPublished: { type: Boolean, default: false, index: true },
    enrollmentCount: { type: Number, default: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    tags: [{ type: String, trim: true }],
    requirements: [{ type: String }],
    whatYouLearn: [{ type: String }],
  },
  { timestamps: true }
);

courseSchema.index(
  { title: 'text', description: 'text', tags: 'text' },
  { default_language: 'none', language_override: 'textSearchLanguage' }
);
courseSchema.index({ category: 1, isPublished: 1 });

// Generate slug from title
courseSchema.pre('validate', function (next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    // Add random suffix to ensure uniqueness
    this.slug += '-' + Math.random().toString(36).substring(2, 8);
  }
  next();
});

const Course: Model<ICourse> =
  mongoose.models.Course || mongoose.model<ICourse>('Course', courseSchema);

export default Course;
