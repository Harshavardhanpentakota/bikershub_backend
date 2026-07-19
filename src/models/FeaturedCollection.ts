import mongoose, { Document, Schema } from 'mongoose';

export interface IFeaturedCollection extends Document {
  title: string;
  description: string;
  cta: string;
  path: string;
  image: string;
  badge?: string;
  order: number;
}

const FeaturedCollectionSchema = new Schema<IFeaturedCollection>(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    cta:         { type: String, default: 'Shop Now' },
    path:        { type: String, required: true },
    image:       { type: String, required: true },
    badge:       { type: String },
    order:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IFeaturedCollection>('FeaturedCollection', FeaturedCollectionSchema);
