import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAddress {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  isDefault: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  phone?: string;
  addresses: IAddress[];
  wishlist: mongoose.Types.ObjectId[];
  role: 'customer' | 'admin';
  comparePassword(plain: string): Promise<boolean>;
}

const AddressSchema = new Schema<IAddress>(
  {
    name:      String,
    street:    String,
    city:      String,
    state:     String,
    zip:       String,
    phone:     String,
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const UserSchema = new Schema<IUser>(
  {
    name:      { type: String, required: true, trim: true },
    email:     { type: String, required: true, unique: true, lowercase: true },
    password:  { type: String, required: true, minlength: 6 },
    phone:     String,
    addresses: [AddressSchema],
    wishlist:  [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    role:      { type: String, enum: ['customer', 'admin'], default: 'customer' },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.comparePassword = function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
