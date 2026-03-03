/**
 * Seed script — populates the Products collection from mockData.ts
 *
 * Usage:
 *   npm run seed
 *
 * Make sure MONGO_URI is set in .env before running.
 * Adjust the import path below to match your frontend workspace location.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from './config/db';
import Product from './models/Product';

// ─── Adjust this path to point at your frontend mockData ─────────────────────
// Example: import { products } from '../../rider-s-realm/src/data/mockData';
// If mockData is not available, replace with an inline sample array below.
const sampleProducts = [
  {
    name:           'Full-Face Helmet Pro',
    price:          3499,
    originalPrice:  4999,
    discount:       30,
    rating:         4.5,
    reviewCount:    128,
    image:          'https://via.placeholder.com/800x800?text=Helmet',
    images:         ['https://via.placeholder.com/800x800?text=Helmet'],
    category:       'Helmets',
    sizes:          ['S', 'M', 'L', 'XL'],
    colors:         [{ name: 'Matte Black', hex: '#1a1a1a' }],
    badge:          'bestseller',
    compatibleBikes:['All'],
    description:    'Premium full-face helmet with superior ventilation.',
    specifications: { Material: 'ABS Shell', Weight: '1.4 kg', Certification: 'DOT, ECE 22.06' },
    inStock:        true,
    stockQuantity:  50,
  },
  {
    name:           'Riding Gloves — Summer Mesh',
    price:          799,
    rating:         4.2,
    reviewCount:    64,
    image:          'https://via.placeholder.com/800x800?text=Gloves',
    images:         ['https://via.placeholder.com/800x800?text=Gloves'],
    category:       'Gloves',
    sizes:          ['S', 'M', 'L', 'XL', 'XXL'],
    colors:         [{ name: 'Black', hex: '#000000' }, { name: 'Blue', hex: '#1565c0' }],
    badge:          'new',
    compatibleBikes:['All'],
    description:    'Breathable summer mesh gloves with knuckle protection.',
    specifications: { Material: 'Mesh + Leather', Closure: 'Velcro Wrist' },
    inStock:        true,
    stockQuantity:  120,
  },
];

(async () => {
  try {
    await connectDB();
    await Product.deleteMany({});
    const inserted = await Product.insertMany(sampleProducts);
    console.log(`✅ Seeded ${inserted.length} products`);
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
