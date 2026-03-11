import { Router, Request, Response } from 'express';
import Order   from '../models/Order';
import Product from '../models/Product';
import User    from '../models/User';
import Review  from '../models/Review';
import Settings from '../models/Settings';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();
// All admin routes require auth + admin role
router.use(protect, adminOnly);

/* ═══════════════════════════════════════════════════════════
   DASHBOARD  –  GET /api/admin/dashboard
   ═══════════════════════════════════════════════════════════ */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const now      = new Date();
    const thirtyDA = new Date(now);
    thirtyDA.setDate(thirtyDA.getDate() - 30);
    const sixtyDA  = new Date(now);
    sixtyDA.setDate(sixtyDA.getDate() - 60);

    const [
      allOrders, prevOrders,
      allUsers, prevUsers,
      allProducts,
      recentOrders,
      lowStockProducts,
      recentReviews,
    ] = await Promise.all([
      Order.find({ createdAt: { $gte: thirtyDA } }).lean(),
      Order.find({ createdAt: { $gte: sixtyDA, $lt: thirtyDA } }).lean(),
      User.countDocuments({ createdAt: { $gte: thirtyDA } }),
      User.countDocuments({ createdAt: { $gte: sixtyDA, $lt: thirtyDA } }),
      Product.countDocuments(),
      Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name email').lean(),
      Product.find({ stockQuantity: { $lt: 5 } }).sort({ stockQuantity: 1 }).limit(10).lean(),
      Review.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name').lean(),
    ]);

    const totalRevenue = allOrders.reduce((s, o) => s + (o.total ?? 0), 0);
    const prevRevenue  = prevOrders.reduce((s, o) => s + (o.total ?? 0), 0);

    const pctChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? '+100%' : '0%';
      const pct = ((curr - prev) / prev) * 100;
      return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
    };

    res.json({
      stats: {
        totalRevenue: {
          value:      Math.round(totalRevenue * 100) / 100,
          change:     pctChange(totalRevenue, prevRevenue),
          changeType: totalRevenue >= prevRevenue ? 'positive' : 'negative',
        },
        totalOrders: {
          value:      allOrders.length,
          change:     pctChange(allOrders.length, prevOrders.length),
          changeType: allOrders.length >= prevOrders.length ? 'positive' : 'negative',
        },
        totalUsers: {
          value:      allUsers,
          change:     pctChange(allUsers, prevUsers),
          changeType: allUsers >= prevUsers ? 'positive' : 'negative',
        },
        totalProducts: {
          value:      allProducts,
          change:     '+0',
          changeType: 'positive',
        },
      },
      recentOrders,
      lowStockProducts,
      recentReviews,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ANALYTICS  –  GET /api/admin/analytics/*
   ═══════════════════════════════════════════════════════════ */

/** Build daily time-series from orders in [since, now] */
async function buildTimeSeries(rangeDays: number) {
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);

  const [orders, users] = await Promise.all([
    Order.find({ createdAt: { $gte: since } }).lean(),
    User.find({ createdAt: { $gte: since } }).lean(),
  ]);

  const dayMap: Record<string, { revenue: number; orders: number; users: number }> = {};
  const pad = (date: Date) =>
    `${date.toLocaleString('en-us', { month: 'short' })} ${date.getDate()}`;

  for (const o of orders) {
    const key = pad(new Date((o as any).createdAt));
    if (!dayMap[key]) dayMap[key] = { revenue: 0, orders: 0, users: 0 };
    dayMap[key].revenue += o.total ?? 0;
    dayMap[key].orders++;
  }
  for (const u of users) {
    const key = pad(new Date((u as any).createdAt));
    if (!dayMap[key]) dayMap[key] = { revenue: 0, orders: 0, users: 0 };
    dayMap[key].users++;
  }

  return Object.entries(dayMap).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue * 100) / 100,
    orders:  v.orders,
    users:   v.users,
  }));
}

async function buildSummary(rangeDays: number) {
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);
  const prevSince = new Date(since);
  prevSince.setDate(prevSince.getDate() - rangeDays);

  const [currOrders, prevOrders, newUsers, prevNewUsers] = await Promise.all([
    Order.find({ createdAt: { $gte: since } }).lean(),
    Order.find({ createdAt: { $gte: prevSince, $lt: since } }).lean(),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ createdAt: { $gte: prevSince, $lt: since } }),
  ]);

  const totalRevenue = currOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const prevRevenue  = prevOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const avgOrderValue = currOrders.length ? totalRevenue / currOrders.length : 0;

  const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? '+100%' : '0%';
    const pct = ((curr - prev) / prev) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  };

  return {
    totalRevenue:   Math.round(totalRevenue * 100) / 100,
    totalOrders:    currOrders.length,
    newUsers,
    avgOrderValue:  Math.round(avgOrderValue * 100) / 100,
    revenueChange:  pctChange(totalRevenue, prevRevenue),
    ordersChange:   pctChange(currOrders.length, prevOrders.length),
    usersChange:    pctChange(newUsers, prevNewUsers),
  };
}

async function buildTopProducts(limit: number, rangeDays: number) {
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);

  const orders = await Order.find({ createdAt: { $gte: since } }).lean();

  const map: Record<string, { name: string; sales: number; revenue: number }> = {};
  for (const o of orders) {
    for (const item of o.items) {
      const key = item.name;
      if (!map[key]) map[key] = { name: key, sales: 0, revenue: 0 };
      map[key].sales   += item.quantity ?? 1;
      map[key].revenue += (item.price ?? 0) * (item.quantity ?? 1);
    }
  }

  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));
}

async function buildCategoryBreakdown(rangeDays: number) {
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);

  // Use product categories to map item names
  const [orders, products] = await Promise.all([
    Order.find({ createdAt: { $gte: since } }).lean(),
    Product.find().select('name category').lean(),
  ]);

  const nameToCat: Record<string, string> = {};
  for (const p of products) nameToCat[p.name] = p.category ?? 'Other';

  const catMap: Record<string, number> = {};
  for (const o of orders) {
    for (const item of o.items) {
      const cat = nameToCat[item.name] ?? 'Other';
      catMap[cat] = (catMap[cat] ?? 0) + (item.price ?? 0) * (item.quantity ?? 1);
    }
  }

  return Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, revenue]) => ({ category, revenue: Math.round(revenue * 100) / 100 }));
}

/* GET /api/admin/analytics */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const range = Math.min(365, parseInt((req.query.range as string) || '30', 10) || 30);
    const [timeSeries, topProducts, summary] = await Promise.all([
      buildTimeSeries(range),
      buildTopProducts(10, range),
      buildSummary(range),
    ]);
    res.json({ timeSeries, topProducts, summary });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* GET /api/admin/analytics/summary */
router.get('/analytics/summary', async (req: Request, res: Response) => {
  try {
    const range = Math.min(365, parseInt((req.query.range as string) || '30', 10) || 30);
    res.json(await buildSummary(range));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* GET /api/admin/analytics/revenue */
router.get('/analytics/revenue', async (req: Request, res: Response) => {
  try {
    const range = Math.min(365, parseInt((req.query.range as string) || '30', 10) || 30);
    const ts    = await buildTimeSeries(range);
    res.json(ts.map(({ date, revenue }) => ({ date, revenue })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* GET /api/admin/analytics/orders */
router.get('/analytics/orders', async (req: Request, res: Response) => {
  try {
    const range = Math.min(365, parseInt((req.query.range as string) || '30', 10) || 30);
    const ts    = await buildTimeSeries(range);
    res.json(ts.map(({ date, orders }) => ({ date, orders })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* GET /api/admin/analytics/customers */
router.get('/analytics/customers', async (req: Request, res: Response) => {
  try {
    const range = Math.min(365, parseInt((req.query.range as string) || '30', 10) || 30);
    const ts    = await buildTimeSeries(range);
    res.json(ts.map(({ date, users }) => ({ date, users })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* GET /api/admin/analytics/top-products */
router.get('/analytics/top-products', async (req: Request, res: Response) => {
  try {
    const range = Math.min(365, parseInt((req.query.range  as string) || '30', 10) || 30);
    const limit = Math.min(50,  parseInt((req.query.limit  as string) || '10', 10) || 10);
    res.json(await buildTopProducts(limit, range));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* GET /api/admin/analytics/category-breakdown */
router.get('/analytics/category-breakdown', async (req: Request, res: Response) => {
  try {
    const range = Math.min(365, parseInt((req.query.range as string) || '30', 10) || 30);
    res.json(await buildCategoryBreakdown(range));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   AI INSIGHTS  –  GET/POST /api/admin/ai-insights
   ═══════════════════════════════════════════════════════════ */
async function generateInsights() {
  const thirtyDA = new Date();
  thirtyDA.setDate(thirtyDA.getDate() - 30);
  const sixtyDA  = new Date();
  sixtyDA.setDate(sixtyDA.getDate() - 60);

  const [
    lowStockProducts,
    currOrders,
    prevOrders,
    currUsers,
    prevUsers,
  ] = await Promise.all([
    Product.find({ stockQuantity: { $gt: 0, $lt: 5 } }).sort({ stockQuantity: 1 }).limit(5).lean(),
    Order.find({ createdAt: { $gte: thirtyDA } }).lean(),
    Order.find({ createdAt: { $gte: sixtyDA, $lt: thirtyDA } }).lean(),
    User.countDocuments({ createdAt: { $gte: thirtyDA } }),
    User.countDocuments({ createdAt: { $gte: sixtyDA, $lt: thirtyDA } }),
  ]);

  const insights: {
    type: string; severity: string; title: string; description: string; action: string;
  }[] = [];

  // Low-stock alerts
  for (const p of lowStockProducts) {
    insights.push({
      type:        'inventory',
      severity:    p.stockQuantity === 0 ? 'high' : p.stockQuantity < 3 ? 'high' : 'medium',
      title:       'Low stock alert',
      description: `${p.name} has only ${p.stockQuantity} unit${p.stockQuantity === 1 ? '' : 's'} left. Reorder recommended.`,
      action:      `Restock ${p.name}`,
    });
  }

  // Revenue trend
  const currRev = currOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const prevRev = prevOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  if (prevRev > 0) {
    const change = ((currRev - prevRev) / prevRev) * 100;
    if (Math.abs(change) >= 10) {
      insights.push({
        type:        'revenue',
        severity:    change > 0 ? 'info' : 'medium',
        title:       change > 0 ? 'Revenue is growing' : 'Revenue declined',
        description: `Revenue ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}% compared to the previous 30 days.`,
        action:      change > 0 ? 'Continue current promotions' : 'Review pricing and run a promotion',
      });
    }
  }

  // User growth
  if (prevUsers > 0) {
    const userChange = ((currUsers - prevUsers) / prevUsers) * 100;
    if (userChange >= 20) {
      insights.push({
        type:        'customers',
        severity:    'info',
        title:       'Strong user growth',
        description: `New registrations grew by ${userChange.toFixed(1)}% vs the previous 30 days.`,
        action:      'Capitalise with a welcome-discount campaign',
      });
    }
  }

  // Top selling product insight
  const itemMap: Record<string, { name: string; qty: number }> = {};
  for (const o of currOrders) {
    for (const item of o.items) {
      if (!itemMap[item.name]) itemMap[item.name] = { name: item.name, qty: 0 };
      itemMap[item.name].qty += item.quantity ?? 1;
    }
  }
  const top = Object.values(itemMap).sort((a, b) => b.qty - a.qty)[0];
  if (top) {
    insights.push({
      type:        'sales',
      severity:    'info',
      title:       'Top selling product',
      description: `"${top.name}" leads with ${top.qty} units sold in the last 30 days.`,
      action:      `Ensure sufficient inventory for ${top.name}`,
    });
  }

  return { generatedAt: new Date().toISOString(), insights };
}

/* GET /api/admin/ai-insights */
router.get('/ai-insights', async (_req: Request, res: Response) => {
  try {
    res.json(await generateInsights());
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* POST /api/admin/ai-insights/generate */
router.post('/ai-insights/generate', async (_req: Request, res: Response) => {
  try {
    res.json(await generateInsights());
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   REVIEWS  –  GET /api/admin/reviews
   ═══════════════════════════════════════════════════════════ */
router.get('/reviews', async (req: Request, res: Response) => {
  try {
    const {
      productId, rating, search, from, to,
      page = '1', limit = '20',
    } = req.query as Record<string, string>;

    const query: Record<string, unknown> = {};
    if (productId) query.product = productId;
    if (rating)    query.rating  = Number(rating);
    if (from || to) {
      query.createdAt = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to   ? { $lte: new Date(to)   } : {}),
      };
    }
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { comment:  { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Review.find(query)
        .populate('user',    'name email')
        .populate('product', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Review.countDocuments(query),
    ]);

    res.json({ items, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   SETTINGS  –  GET/PUT /api/admin/settings
   ═══════════════════════════════════════════════════════════ */

/** Returns the singleton settings document, creating it on first access */
async function getSettings() {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  return settings;
}

/* GET /api/admin/settings */
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    res.json(await getSettings());
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* PUT /api/admin/settings */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    const allowed = [
      'storeName', 'storeEmail', 'currency', 'taxRate', 'shippingFee',
      'freeShippingThreshold', 'maintenanceMode', 'allowGuestCheckout',
      'emailNotifications',
    ] as const;

    for (const key of allowed) {
      if (req.body[key] !== undefined) (settings as any)[key] = req.body[key];
    }

    await settings.save();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* PUT /api/admin/settings/password  (Auth only — not admin-gated inline) */
// Note: adminOnly is applied via router.use() above, which is fine for admins
router.put('/settings/password', async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });

    const user = await User.findById(req.user!._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = await user.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   BULK IMPORT (also reachable via /api/admin/products/…)
   These are just convenience re-exports handled in products.ts
   ═══════════════════════════════════════════════════════════ */

export default router;
