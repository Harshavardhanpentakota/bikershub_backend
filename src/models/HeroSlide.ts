import mongoose, { Document, Schema } from 'mongoose';

export interface IHeroSlide extends Document {
  image: string;
  badge: string;
  title: string;
  description: string;
  cta1Label: string;
  cta1Path: string;
  cta2Label: string;
  cta2Path: string;
  align: 'left' | 'center';
  order: number;
}

const HeroSlideSchema = new Schema<IHeroSlide>(
  {
    image:       { type: String, required: true },
    badge:       { type: String, default: '' },
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    cta1Label:   { type: String, default: 'Shop Now' },
    cta1Path:    { type: String, default: '/shop' },
    cta2Label:   { type: String, default: '' },
    cta2Path:    { type: String, default: '' },
    align:       { type: String, enum: ['left', 'center'], default: 'left' },
    order:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IHeroSlide>('HeroSlide', HeroSlideSchema);
