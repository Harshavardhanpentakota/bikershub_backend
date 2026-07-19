import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { connectDB } from './config/db';
import BikeCatalog from './models/BikeCatalog';
import mongoose from 'mongoose';

/** Minimal CSV line parser supporting double-quoted fields with escaped `""`. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

async function seed() {
  const csvPath = path.join(__dirname, '..', 'data', 'bikes_master.csv');
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const [header, ...rows] = lines;
  const cols = parseCsvLine(header).map((c) => c.toLowerCase());
  const brandIdx = cols.indexOf('brand');
  const modelIdx = cols.indexOf('model');
  if (brandIdx === -1 || modelIdx === -1) {
    throw new Error(`bikes_master.csv must have "brand" and "model" columns, got: ${header}`);
  }

  const brandMap = new Map<string, string[]>();
  for (const row of rows) {
    const fields = parseCsvLine(row);
    const brand = fields[brandIdx];
    const model = fields[modelIdx];
    if (!brand || !model) continue;
    if (!brandMap.has(brand)) brandMap.set(brand, []);
    brandMap.get(brand)!.push(model);
  }

  await connectDB();

  await BikeCatalog.deleteMany({});
  const docs = Array.from(brandMap.entries()).map(([brand, models]) => ({
    brand,
    models: Array.from(new Set(models)).sort(),
  }));
  await BikeCatalog.insertMany(docs);

  console.log(`Seeded ${docs.length} brands, ${docs.reduce((n, d) => n + d.models.length, 0)} models total.`);
  for (const d of docs) console.log(`  ${d.brand}: ${d.models.length}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
