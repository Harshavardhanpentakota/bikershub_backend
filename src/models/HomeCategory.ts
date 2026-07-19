import mongoose, { Document, Schema } from 'mongoose';

export interface IHomeCategory extends Document {
  name: string;
  categoryValue: string;
  icon?: string;
  image?: string;
  order: number;
}

const HomeCategorySchema = new Schema<IHomeCategory>(
  {
    name:          { type: String, required: true, trim: true },
    categoryValue: { type: String, required: true, trim: true },
    icon:          { type: String },
    image:         { type: String },
    order:         { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IHomeCategory>('HomeCategory', HomeCategorySchema);
