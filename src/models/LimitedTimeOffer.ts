import mongoose, { Document, Schema } from 'mongoose';

export interface ILimitedTimeOffer extends Document {
  title: string;
  subtitle: string;
  cta: string;
  path: string;
  image: string;
  badge?: string;
  endsAt?: Date;
  order: number;
}

const LimitedTimeOfferSchema = new Schema<ILimitedTimeOffer>(
  {
    title:    { type: String, required: true, trim: true },
    subtitle: { type: String, default: '' },
    cta:      { type: String, default: 'Shop Now' },
    path:     { type: String, required: true },
    image:    { type: String, required: true },
    badge:    { type: String },
    endsAt:   { type: Date },
    order:    { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<ILimitedTimeOffer>('LimitedTimeOffer', LimitedTimeOfferSchema);
