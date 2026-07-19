import mongoose, { Document, Schema } from 'mongoose';

export interface ITrendingCard extends Document {
  title: string;
  subtitle: string;
  path: string;
  image: string;
  span: 'tall' | 'wide' | 'normal';
  order: number;
}

const TrendingCardSchema = new Schema<ITrendingCard>(
  {
    title:    { type: String, required: true, trim: true },
    subtitle: { type: String, default: '' },
    path:     { type: String, required: true },
    image:    { type: String, required: true },
    span:     { type: String, enum: ['tall', 'wide', 'normal'], default: 'normal' },
    order:    { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<ITrendingCard>('TrendingCard', TrendingCardSchema);
