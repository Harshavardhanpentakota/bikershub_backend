import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  name: string;
  image: string;
  price: number;
  quantity: number;
  selectedSize: string;
  selectedColor: string;
}

export interface IShippingAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

export interface IOrder extends Document {
  user: mongoose.Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  shippingMethod: 'standard' | 'express';
  paymentMethod: 'cod' | 'razorpay' | 'upi';
  paymentStatus: 'pending' | 'paid' | 'failed';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  trackingId?: string;
}

const OrderSchema = new Schema<IOrder>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        product:       { type: Schema.Types.ObjectId, ref: 'Product' },
        name:          String,
        image:         String,
        price:         Number,
        quantity:      Number,
        selectedSize:  String,
        selectedColor: String,
      },
    ],
    shippingAddress: {
      name: String, street: String, city: String,
      state: String, zip: String, phone: String,
    },
    shippingMethod:    { type: String, enum: ['standard', 'express'], default: 'standard' },
    paymentMethod:     { type: String, enum: ['cod', 'razorpay', 'upi'], default: 'cod' },
    paymentStatus:     { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    razorpayOrderId:   String,
    razorpayPaymentId: String,
    subtotal:          Number,
    shippingCost:      Number,
    total:             { type: Number, required: true },
    status:            {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    trackingId: String,
  },
  { timestamps: true }
);

export default mongoose.model<IOrder>('Order', OrderSchema);
