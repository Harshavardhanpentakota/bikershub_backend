import mongoose, { Document, Schema } from 'mongoose';

export interface ICartItem {
  product: mongoose.Types.ObjectId;
  name: string;
  image: string;
  price: number;
  quantity: number;
  selectedSize: string;
  selectedColor: string;
}

export interface ICart extends Document {
  user: mongoose.Types.ObjectId;
  items: ICartItem[];
}

const CartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [
      {
        product:       { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        name:          String,
        image:         String,
        price:         Number,
        quantity:      { type: Number, default: 1, min: 1 },
        selectedSize:  String,
        selectedColor: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ICart>('Cart', CartSchema);
