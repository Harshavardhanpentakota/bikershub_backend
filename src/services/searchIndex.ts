import Fuse from 'fuse.js';
import Product from '../models/Product';

interface SearchDoc {
  id: string;
  name: string;
  description: string;
  category: string;
  compatibleBikes: string[];
}

const REBUILD_TTL_MS = 5 * 60 * 1000; // safety-net refresh, in case a write bypasses invalidateSearchIndex()

let fuse: Fuse<SearchDoc> | null = null;
let builtAt = 0;
let buildingPromise: Promise<Fuse<SearchDoc>> | null = null;

async function buildIndex(): Promise<Fuse<SearchDoc>> {
  const docs = await Product.find({}, { name: 1, description: 1, category: 1, compatibleBikes: 1 }).lean();
  const searchDocs: SearchDoc[] = docs.map((d: any) => ({
    id: String(d._id),
    name: d.name || '',
    description: d.description || '',
    category: d.category || '',
    compatibleBikes: Array.isArray(d.compatibleBikes) ? d.compatibleBikes : [],
  }));

  const index = new Fuse(searchDocs, {
    keys: [
      { name: 'name', weight: 0.5 },
      { name: 'category', weight: 0.25 },
      { name: 'compatibleBikes', weight: 0.15 },
      { name: 'description', weight: 0.1 },
    ],
    threshold: 0.38,       // 0 = exact match only, 1 = match anything — tuned for light typo tolerance
    ignoreLocation: true,  // don't penalize matches that aren't near the start of the field
    minMatchCharLength: 2,
  });

  fuse = index;
  builtAt = Date.now();
  return index;
}

async function getIndex(): Promise<Fuse<SearchDoc>> {
  if (fuse && Date.now() - builtAt < REBUILD_TTL_MS) return fuse;
  if (buildingPromise) return buildingPromise;
  buildingPromise = buildIndex().finally(() => { buildingPromise = null; });
  return buildingPromise;
}

/** Call after any product create/update/delete/import so the next search reflects current data. */
export function invalidateSearchIndex(): void {
  fuse = null;
  builtAt = 0;
}

/** Returns matching product ids ordered by relevance (best match first). */
export async function fuzzySearchProductIds(term: string): Promise<string[]> {
  const index = await getIndex();
  return index.search(term).map((r) => r.item.id);
}
