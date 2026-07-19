import mongoose, { Document, Schema } from 'mongoose';

export interface IBikeCatalog extends Document {
  brand: string;
  models: string[];
}

const BikeCatalogSchema = new Schema<IBikeCatalog>(
  {
    brand:  { type: String, required: true, unique: true, trim: true },
    models: [String],
  },
  { timestamps: true }
);

export default mongoose.model<IBikeCatalog>('BikeCatalog', BikeCatalogSchema);
