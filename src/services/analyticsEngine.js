/**
 * analyticsEngine.js
 *
 * Pure analytics computation layer.
 * Tasks 1, 13: Revenue, GST, Profit, Category, Source, Peak Hours.
 * Rule: NO real-time listeners. Data passed in from one-shot fetches.
 * Refresh every 60 seconds via useAdvancedAnalytics hook.
 *
 * AUDIT FIX (paid-only consistency):
 *   calcRevenue     — totalOrders now = paid.length (was orders.length)
 *   calcOrderSource — now iterates paid orders only (was all orders)
 *   calcPeakHours   — count now paid only (revenue was already paid only)
 *   calcItemPerformance — qty now paid only (revenue was already paid only)
 * All other functions were already paid-only — zero changes to them.
 */

// ─── Revenue ──────────────────────────────────────────────────────────────────

export const calcRevenue = (orders = []) => {
  const paid = orders.filter(o => o.paymentStatus === 'paid');
  const gross = paid.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const discounts = paid.reduce((s, o) => s + (o.discountAmount || 0), 0);
  const netRevenue = gross - discounts;
  // FIX: totalOrders = paid.length — only paid orders count toward the total.
  // Previously this was orders.length which included pending/cancelled orders.
  const totalOrders = paid.length;
  const aov = paid.length > 0 ? gross / paid.length : 0;
  return { gross, discounts, netRevenue, totalOrders, aov, paidOrders: paid.length };
};

// ─── Payment Breakdown ────────────────────────────────────────────────────────

export const calcPaymentBreakdown = (orders = []) => {
  const paid = orders.filter(o => o.paymentStatus === 'paid');
  const counts = { upi: 0, cash: 0, card: 0, online: 0, counter: 0, other: 0 };
  const revenue = { upi: 0, cash: 0, card: 0, online: 0, counter: 0, other: 0 };

  paid.forEach(o => {
    const mode = (o.paymentMode || 'other').toLowerCase();
    const key = ['upi', 'cash', 'card', 'online', 'counter', 'prepaid'].includes(mode)
      ? (mode === 'prepaid' ? 'upi' : mode)
      : 'other';
    counts[key] = (counts[key] || 0) + 1;
    revenue[key] = (revenue[key] || 0) + (o.totalAmount || 0);
  });

  const total = paid.length || 1;
  return Object.entries(counts).map(([method, count]) => ({
    method: method.toUpperCase(),
    count,
    revenue: revenue[method] || 0,
    pct: parseFloat(((count / total) * 100).toFixed(1)),
  })).filter(i => i.count > 0);
};

// ─── Order Source ─────────────────────────────────────────────────────────────

export const calcOrderSource = (orders = []) => {
  const map = {};
  // FIX: iterate paid orders only — source distribution should reflect revenue-generating
  // orders, not pending/cancelled ones which never completed.
  // Previously this was orders.forEach which counted all orders including cancelled.
  const paid = orders.filter(o => o.paymentStatus === 'paid');
  paid.forEach(o => {
    const src = o.orderSource || (o.externalOrder ? 'external' : 'qr');
    map[src] = (map[src] || 0) + 1;
  });
  const total = paid.length || 1;  // FIX: was orders.length
  return Object.entries(map).map(([source, count]) => ({
    source: source.toUpperCase(),
    count,
    pct: parseFloat(((count / total) * 100).toFixed(1)),
  })).sort((a, b) => b.count - a.count);
};

// ─── Peak Hours ───────────────────────────────────────────────────────────────

export const calcPeakHours = (orders = []) => {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, revenue: 0 }));
  // FIX: count and revenue both from PAID orders only.
  // Previously count included all orders while revenue was already paid-only,
  // creating an inconsistency where count > paid order count.
  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    const h = o.createdAt?.toDate?.()?.getHours?.();
    if (h !== undefined) {
      hours[h].count++;
      hours[h].revenue += (o.totalAmount || 0);
    }
  });
  return hours.map(h => ({
    ...h,
    label: `${String(h.hour).padStart(2, '0')}:00`,
  }));
};

// ─── Item Performance ─────────────────────────────────────────────────────────

export const calcItemPerformance = (orders = [], menuItems = []) => {
  const map = {};
  // FIX: only count qty and revenue from PAID orders.
  // Previously qty was counted for all orders while revenue was paid-only,
  // causing qty to be inflated by pending/cancelled orders.
  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    (o.items || []).forEach(item => {
      if (!map[item.name]) {
        const menuItem = menuItems.find(m => m.name === item.name);
        map[item.name] = {
          name: item.name,
          category: menuItem?.category || 'Other',
          price: item.price || 0,
          qty: 0,
          revenue: 0,
        };
      }
      map[item.name].qty += item.quantity || 1;
      map[item.name].revenue += (item.price || 0) * (item.quantity || 1);
    });
  });
  const sorted = Object.values(map).sort((a, b) => b.revenue - a.revenue);
  return {
    top: sorted.slice(0, 10),
    bottom: sorted.slice(-5).reverse(),
    all: sorted,
  };
};

// ─── GST Calculation ──────────────────────────────────────────────────────────

export const calcGST = (orders = [], menuItems = []) => {
  // Build price→gstRate map from menu
  const gstMap = {};
  menuItems.forEach(m => { gstMap[m.name] = m.gstRate || 0; });

  const byRate = {}; // { '5': { taxable, gst, orders } }
  let totalGST = 0;
  let totalTaxable = 0;

  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    // Use per-order GST if already calculated
    if (o.gstAmount && o.gstAmount > 0) {
      const rate = o.gstRate || 5;
      if (!byRate[rate]) byRate[rate] = { rate, taxable: 0, gst: 0, count: 0 };
      byRate[rate].taxable += (o.subtotalAmount || o.totalAmount || 0);
      byRate[rate].gst += o.gstAmount;
      byRate[rate].count++;
      totalGST += o.gstAmount;
      totalTaxable += (o.subtotalAmount || 0);
    } else {
      // Calculate from items using menu gstRate
      (o.items || []).forEach(item => {
        const rate = gstMap[item.name] || 0;
        const taxable = (item.price || 0) * (item.quantity || 1);
        const gst = taxable * rate / 100;
        if (!byRate[rate]) byRate[rate] = { rate, taxable: 0, gst: 0, count: 0 };
        byRate[rate].taxable += taxable;
        byRate[rate].gst += gst;
        byRate[rate].count++;
        totalGST += gst;
        totalTaxable += taxable;
      });
    }
  });

  return {
    byRate: Object.values(byRate).sort((a, b) => a.rate - b.rate),
    totalGST,
    totalTaxable,
    netAfterTax: totalTaxable - totalGST,
  };
};

// ─── Profit Calculation ───────────────────────────────────────────────────────

export const calcProfit = (orders = [], inventory = [], recipes = []) => {
  // Build recipeMap: menuItemName → cost
  const recipeMap = {};
  recipes.forEach(r => {
    let cost = 0;
    (r.ingredients || []).forEach(ing => {
      const invItem = inventory.find(i => i.id === (ing.itemId || ing.inventoryItemId));
      if (invItem && invItem.costPerUnit) {
        cost += (invItem.costPerUnit || 0) * (ing.quantity || 0);
      }
    });
    recipeMap[r.menuItemName] = cost;
  });

  let totalCost = 0;
  let totalRevenue = 0;
  let totalGST = 0;

  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    totalRevenue += (o.totalAmount || 0);
    totalGST += (o.gstAmount || 0);
    (o.items || []).forEach(item => {
      const cost = recipeMap[item.name] || 0;
      totalCost += cost * (item.quantity || 1);
    });
  });

  const netProfit = totalRevenue - totalCost - totalGST;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    totalRevenue,
    totalCost,
    totalGST,
    netProfit,
    margin: parseFloat(margin.toFixed(1)),
    hasCostData: Object.keys(recipeMap).length > 0,
  };
};

// ─── Category Analytics ───────────────────────────────────────────────────────

export const calcCategoryAnalytics = (orders = [], menuItems = [], inventory = [], recipes = []) => {
  const catMap = {};
  const menuCatMap = {};
  menuItems.forEach(m => { menuCatMap[m.name] = m.category || 'Other'; });

  // Revenue + orders per category — paid orders only
  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    (o.items || []).forEach(item => {
      const cat = menuCatMap[item.name] || 'Other';
      if (!catMap[cat]) catMap[cat] = { category: cat, revenue: 0, qty: 0, gst: 0, cost: 0 };
      catMap[cat].revenue += (item.price || 0) * (item.quantity || 1);
      catMap[cat].qty += item.quantity || 1;
    });
  });

  const totalRevenue = Object.values(catMap).reduce((s, c) => s + c.revenue, 0) || 1;

  const result = Object.values(catMap).map(cat => ({
    ...cat,
    pct: parseFloat(((cat.revenue / totalRevenue) * 100).toFixed(1)),
  })).sort((a, b) => b.revenue - a.revenue);

  return {
    categories: result,
    highest: result[0] || null,
    lowest: result[result.length - 1] || null,
  };
};

// ─── Revenue by day (last 7 or 30 days) ──────────────────────────────────────

export const calcRevenueByDay = (orders = [], days = 7) => {
  const result = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    d.setHours(0, 0, 0, 0);
    return { date: d, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), revenue: 0, orders: 0 };
  });

  // Paid orders only — use paidAt if available, fall back to createdAt
  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    const raw = o.paidAt || o.createdAt;
    const t = raw?.toDate?.() || (raw ? new Date(raw) : new Date(0));
    const idx = result.findIndex(r => {
      const next = new Date(r.date); next.setDate(next.getDate() + 1);
      return t >= r.date && t < next;
    });
    if (idx >= 0) {
      result[idx].orders++;
      result[idx].revenue += (o.totalAmount || 0);
    }
  });

  return result.map(r => ({ ...r, revenue: parseFloat(r.revenue.toFixed(2)) }));
};

// ─── Full analytics snapshot ──────────────────────────────────────────────────

export const buildAnalyticsSnapshot = (orders, menuItems, inventory, recipes) => ({
  revenue:      calcRevenue(orders),
  payment:      calcPaymentBreakdown(orders),
  source:       calcOrderSource(orders),
  peakHours:    calcPeakHours(orders),
  items:        calcItemPerformance(orders, menuItems),
  gst:          calcGST(orders, menuItems),
  profit:       calcProfit(orders, inventory, recipes),
  categories:   calcCategoryAnalytics(orders, menuItems, inventory, recipes),
  revenueByDay: calcRevenueByDay(orders, 7),
  revenueBy30:  calcRevenueByDay(orders, 30),
  generatedAt:  new Date(),
});
