import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating: number;
  reviewCount: number;
  image: string;
  images: string[];
  category: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
  badge?: 'new' | 'bestseller' | 'discount';
  compatibleBikes: string[];
  description: string;
  specifications: Map<string, string>;
  inStock: boolean;
  stockQuantity: number;
}

const ProductSchema = new Schema<IProduct>(
  {
    name:            { type: String, required: true, trim: true },
    price:           { type: Number, required: true, min: 0 },
    originalPrice:   Number,
    discount:        Number,
    rating:          { type: Number, default: 0, min: 0, max: 5 },
    reviewCount:     { type: Number, default: 0 },
    image:           { type: String, required: true },
    images:          [String],
    category:        { type: String, required: true, index: true },
    sizes:           [String],
    colors:          [{ name: String, hex: String }],
    badge:           { type: String, enum: ['new', 'bestseller', 'discount'] },
    compatibleBikes: [String],
    description:     String,
    specifications:  { type: Map, of: String },
    inStock:         { type: Boolean, default: true },
    stockQuantity:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Full-text search index
ProductSchema.index({ name: 'text', description: 'text', category: 'text' });

export default mongoose.model<IProduct>('Product', ProductSchema);
