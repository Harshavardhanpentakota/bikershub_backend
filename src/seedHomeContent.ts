import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db';
import HomeCategory from './models/HomeCategory';
import FeaturedCollection from './models/FeaturedCollection';
import TrendingCard from './models/TrendingCard';
import LimitedTimeOffer from './models/LimitedTimeOffer';
import HeroSlide from './models/HeroSlide';

const HELMET_IMG = 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=300&h=300&fit=crop';
const JACKET_IMG = 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=300&h=300&fit=crop';
const PARTS_IMG = 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?w=300&h=300&fit=crop';
const WINTER_IMG = 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=300&h=300&fit=crop';
const FLATLAY_IMG = 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=300&h=300&fit=crop';

const categories = [
  { name: 'Helmets',       image: HELMET_IMG,  categoryValue: 'Helmets' },
  { name: 'Riding Gear',   image: JACKET_IMG,  categoryValue: 'Riding Gears' },
  { name: 'Parts',         image: PARTS_IMG,   categoryValue: 'Parts' },
  { name: 'Accessories',   image: FLATLAY_IMG, categoryValue: 'Accessories' },
  { name: 'Tires',         image: PARTS_IMG,   categoryValue: 'Tires' },
  { name: 'Protection',    image: HELMET_IMG,  categoryValue: 'Airbags' },
  { name: 'Winter Gear',   image: WINTER_IMG,  categoryValue: 'Winter Gear' },
  { name: 'Tools',         image: PARTS_IMG,   categoryValue: 'Parts' },
  { name: 'Learn to Ride', image: FLATLAY_IMG, categoryValue: 'Learn To Ride' },
  { name: 'New Riders',    image: JACKET_IMG,  categoryValue: 'New Riders' },
].map((c, i) => ({ ...c, order: i }));

const collections = [
  {
    title: 'New Arrivals',
    description: 'Fresh drops — the latest helmets, gear & accessories just landed.',
    cta: 'Shop New',
    path: '/shop',
    image: 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=800&h=600&fit=crop',
    badge: 'NEW',
  },
  {
    title: 'Top Deals',
    description: 'Up to 40% off on select riding gear. Limited stock — grab yours today.',
    cta: 'View Deals',
    path: '/shop',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&h=600&fit=crop',
    badge: 'SALE',
  },
  {
    title: 'Seasonal Gear',
    description: 'All-weather riding essentials. From winter warmers to summer ventilation.',
    cta: 'Explore',
    path: '/shop?category=Winter+Gear',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&h=600&fit=crop',
    badge: null,
  },
].map((c, i) => ({ ...c, order: i }));

const trending = [
  {
    title: 'Winter Riding',
    subtitle: 'Stay warm, stay safe',
    path: '/shop?category=Winter+Gear',
    image: 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=600&h=750&fit=crop',
    span: 'tall',
  },
  {
    title: 'Performance Helmets',
    subtitle: 'DOT & ECE certified',
    path: '/shop?category=Helmets',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&h=380&fit=crop',
    span: 'normal',
  },
  {
    title: 'Casual Apparel',
    subtitle: 'Style on and off the bike',
    path: '/shop?category=Riding+Gears',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&h=380&fit=crop',
    span: 'normal',
  },
  {
    title: 'Adventure Parts',
    subtitle: 'Upgrade your ride',
    path: '/shop?category=Parts',
    image: 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?w=900&h=380&fit=crop',
    span: 'wide',
  },
].map((c, i) => ({ ...c, order: i }));

const hero = [
  {
    image: 'https://res.cloudinary.com/sfh2iaeu/image/upload/v1784442657/bikershub/home/ofb1d3pwt1b41f5fbcyf.jpg',
    badge: '2026 RELEASES',
    title: 'Gear Up.\nRide Bold.',
    description: 'Premium helmets, riding gear & accessories engineered for performance and protection.',
    cta1Label: 'Shop Now',
    cta1Path: '/shop',
    cta2Label: 'Explore Helmets',
    cta2Path: '/shop?category=Helmets',
    align: 'left',
  },
  {
    image: 'https://res.cloudinary.com/sfh2iaeu/image/upload/v1784442658/bikershub/home/a2omhsbu2cknzsctxpj7.jpg',
    badge: 'SAFETY FIRST',
    title: 'Helmets That\nDefine You',
    description: "DOT & ECE 22.06 certified helmets from the world's top brands — starting at ₹3,999.",
    cta1Label: 'Browse Helmets',
    cta1Path: '/shop?category=Helmets',
    cta2Label: 'View All Gear',
    cta2Path: '/shop',
    align: 'center',
  },
].map((c, i) => ({ ...c, order: i }));

const limitedTime = [
  {
    title: 'Limited Time',
    subtitle: 'Deep discounts on select riding gear — up to 40% off, while stock lasts.',
    cta: 'Shop Deals',
    path: '/shop?badge=discount',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1200&h=500&fit=crop',
    badge: 'SALE',
    order: 0,
  },
];

/**
 * Only seeds a collection if it's completely empty. This is a one-time
 * bootstrap script, not a reset button — re-running it against a DB that
 * admins have already customized via the CRM must never touch their edits.
 * (Learned the hard way: an earlier version unconditionally wiped +
 * reinserted every time, which silently destroyed a live admin edit.)
 */
async function seedIfEmpty(Model: mongoose.Model<any>, label: string, defaults: unknown[]) {
  const count = await Model.countDocuments();
  if (count > 0) {
    console.log(`Skipped ${label}: already has ${count} document(s).`);
    return;
  }
  await Model.insertMany(defaults);
  console.log(`Seeded ${defaults.length} ${label}.`);
}

async function seed() {
  await connectDB();

  await seedIfEmpty(HomeCategory, 'categories', categories);
  await seedIfEmpty(FeaturedCollection, 'collections', collections);
  await seedIfEmpty(TrendingCard, 'trending cards', trending);
  await seedIfEmpty(LimitedTimeOffer, 'limited-time offers', limitedTime);
  await seedIfEmpty(HeroSlide, 'hero slides', hero);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
