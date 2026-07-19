import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db';
import HomeCategory from './models/HomeCategory';
import FeaturedCollection from './models/FeaturedCollection';
import TrendingCard from './models/TrendingCard';
import LimitedTimeOffer from './models/LimitedTimeOffer';

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

async function seed() {
  await connectDB();

  await HomeCategory.deleteMany({});
  await HomeCategory.insertMany(categories);

  await FeaturedCollection.deleteMany({});
  await FeaturedCollection.insertMany(collections);

  await TrendingCard.deleteMany({});
  await TrendingCard.insertMany(trending);

  await LimitedTimeOffer.deleteMany({});
  await LimitedTimeOffer.insertMany(limitedTime);

  console.log(`Seeded ${categories.length} categories, ${collections.length} collections, ${trending.length} trending cards, ${limitedTime.length} limited-time offers.`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
