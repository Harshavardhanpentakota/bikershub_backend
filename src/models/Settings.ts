import mongoose, { Document, Schema } from 'mongoose';

export interface ISettings extends Document {
  storeName: string;
  storeEmail: string;
  currency: string;
  taxRate: number;
  shippingFee: number;
  freeShippingThreshold: number;
  maintenanceMode: boolean;
  allowGuestCheckout: boolean;
  emailNotifications: {
    newOrder: boolean;
    lowStock: boolean;
    newReview: boolean;
  };
}

const SettingsSchema = new Schema<ISettings>(
  {
    storeName:              { type: String,  default: 'BikersHub' },
    storeEmail:             { type: String,  default: 'support@bikershub.com' },
    currency:               { type: String,  default: 'USD' },
    taxRate:                { type: Number,  default: 8.5 },
    shippingFee:            { type: Number,  default: 9.99 },
    freeShippingThreshold:  { type: Number,  default: 100 },
    maintenanceMode:        { type: Boolean, default: false },
    allowGuestCheckout:     { type: Boolean, default: true },
    emailNotifications: {
      newOrder:   { type: Boolean, default: true },
      lowStock:   { type: Boolean, default: true },
      newReview:  { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default mongoose.model<ISettings>('Settings', SettingsSchema);
