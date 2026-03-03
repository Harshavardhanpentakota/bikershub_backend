import mongoose, { Document, Schema } from 'mongoose';

export interface IReview extends Document {
  product: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  userName: string;
  rating: number;
  comment: string;
  verified: boolean;
}

const ReviewSchema = new Schema<IReview>(
  {
    product:  { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    user:     { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    userName: String,
    rating:   { type: Number, required: true, min: 1, max: 5 },
    comment:  { type: String, required: true },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One review per user per product
ReviewSchema.index({ product: 1, user: 1 }, { unique: true });

export default mongoose.model<IReview>('Review', ReviewSchema);
