/*
 * محرّك نقاط الالتقاء (Confluence)
 *
 * الفكرة: المستوى الذي يجتمع عنده أكثر من سبب مستقل — نسبة فيبوناتشي،
 * متوسط متحرك، قاع سابق، منطقة سيولة، فجوة قيمة عادلة، كثافة تداول،
 * رقم نفسي — يكون أصعب في الكسر من مستوى يسنده سبب واحد.
 *
 * نجمع كل المستويات المرشّحة، نضمّ المتقاربة منها في منطقة واحدة،
 * ثم نعطي كل منطقة درجة قوة تعتمد على:
 *   1) عدد الأسباب المختلفة (التنوّع أهم من التكرار)
 *   2) وزن كل سبب
 *   3) سلوك السعر التاريخي عند المنطقة: كم مرة لمسها وارتدّ فعلًا
 */

import * as I from './indicators.js';

export const CATEGORY_LABEL = {
  fib: 'فيبوناتشي',
  ma: 'متوسط متحرك',
  pivot: 'قمة/قاع سابق',
  liquidity: 'تجمّع أوامر',
  fvg: 'فجوة قيمة عادلة',
  ob: 'منطقة أوامر',
  volume: 'كثافة تداول',
  round: 'رقم نفسي',
  band: 'بولينجر',
  vwap: 'VWAP',
  session: 'مستوى جلسة سابقة',
  equilibrium: 'التوازن',
};

/* ------------------------------------------------------------------ */
/* كثافة التداول حسب السعر (ملف الأحجام)                                */
/* ------------------------------------------------------------------ */

export function volumeNodes(bars, { lookback = 300, bins = 48, topN = 3 } = {}) {
  const slice = bars.slice(-lookback);
  if (slice.length < 20) return [];

  let lo = Infinity;
  let hi = -Infinity;
  for (const b of slice) {
    lo = Math.min(lo, b.low);
    hi = Math.max(hi, b.high);
  }
  if (!(hi > lo)) return [];

  const step = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);
  for (const b of slice) {
    const v = b.volume || 1;
    const a = Math.max(0, Math.min(bins - 1, Math.floor((b.low - lo) / step)));
    const z = Math.max(0, Math.min(bins - 1, Math.floor((b.high - lo) / step)));
    const n = z - a + 1;
    for (let i = a; i <= z; i++) vol[i] += v / n;
  }

  return vol
    .map((v, i) => ({ v, i }))
    .sort((x, y) => y.v - x.v)
    .slice(0, topN)
    .map((x, rank) => ({ price: lo + step * (x.i + 0.5), rank, volume: x.v }));
}

/* ------------------------------------------------------------------ */
/* أرقام نفسية قريبة                                                    */
/* ------------------------------------------------------------------ */

function roundNumbers(price, atrNow) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(price, 1e-6))));
  const steps = [mag / 2, mag, mag / 10, mag / 4].filter((s) => s > 0);
  const out = new Set();
  steps.forEach((s) => {
    for (let k = -3; k <= 3; k++) {
      const v = Math.round(price / s) * s + k * s;
      if (v > 0 && Math.abs(v - price) < atrNow * 6) out.add(+v.toPrecision(10));
    }
  });
  return [...out];
}

/* ------------------------------------------------------------------ */
/* قمم وقيعان الجلسات السابقة (مفيدة في الفريمات الداخلية)              */
/* ------------------------------------------------------------------ */

function sessionLevels(bars, intraday) {
  if (!intraday) return [];
  const byDay = new Map();
  bars.forEach((b) => {
    const d = new Date(b.time * 1000).toISOString().slice(0, 10);
    const cur = byDay.get(d) || { high: -Infinity, low: Infinity };
    cur.high = Math.max(cur.high, b.high);
    cur.low = Math.min(cur.low, b.low);
    byDay.set(d, cur);
  });
  const days = [...byDay.entries()];
  if (days.length < 2) return [];
  const [, prev] = days[days.length - 2];
  const out = [
    { price: prev.high, cat: 'session', label: 'قمة الجلسة السابقة', weight: 9 },
    { price: prev.low, cat: 'session', label: 'قاع الجلسة السابقة', weight: 9 },
  ];
  // قمة وقاع آخر خمس جلسات
  const last5 = days.slice(-6, -1);
  if (last5.length) {
    out.push({
      price: Math.max(...last5.map(([, v]) => v.high)),
      cat: 'session',
      label: 'قمة آخر 5 جلسات',
      weight: 8,
    });
    out.push({
      price: Math.min(...last5.map(([, v]) => v.low)),
      cat: 'session',
      label: 'قاع آخر 5 جلسات',
      weight: 8,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* جمع كل المستويات المرشّحة                                            */
/* ------------------------------------------------------------------ */

export function collectLevels(bars, A, { intraday = false } = {}) {
  const levels = [];
  const push = (price, cat, label, weight) => {
    if (price == null || !isFinite(price) || price <= 0) return;
    levels.push({ price, cat, label, weight });
  };

  const cl = I.closes(bars);
  const price = bars[bars.length - 1].close;

  /* فيبوناتشي من الساق الاندفاعية */
  if (A.impulse) {
    const L = A.impulse.levels;
    push(L.r382, 'fib', 'فيبوناتشي 0.382', 9);
    push(L.r5, 'fib', 'فيبوناتشي 0.5', 11);
    push(L.r618, 'fib', 'فيبوناتشي 0.618', 15);
    push(L.r705, 'fib', 'فيبوناتشي 0.705', 13);
    push(L.r79, 'fib', 'فيبوناتشي 0.786', 13);
    push(A.impulse.equilibrium, 'equilibrium', 'خط التوازن', 10);
    push(A.impulse.low.price, 'pivot', 'قاع الساق', 13);
    push(A.impulse.high.price, 'pivot', 'قمة الساق', 13);
  }

  /* المتوسطات المتحركة */
  const emaDefs = [
    [20, 9, 'متوسط أسي 20'],
    [50, 13, 'متوسط أسي 50'],
    [100, 13, 'متوسط أسي 100'],
    [200, 17, 'متوسط أسي 200'],
  ];
  emaDefs.forEach(([p, w, label]) => {
    if (bars.length < p + 5) return;
    const v = I.ema(cl, p);
    push(v[v.length - 1], 'ma', label, w);
  });
  if (bars.length > 205) {
    const s200 = I.sma(cl, 200);
    push(s200[s200.length - 1], 'ma', 'متوسط بسيط 200', 15);
  }

  /* بولينجر */
  if (bars.length > 25) {
    const bb = I.bollinger(cl, 20, 2);
    push(bb.upper[bb.upper.length - 1], 'band', 'بولينجر العلوي', 7);
    push(bb.lower[bb.lower.length - 1], 'band', 'بولينجر السفلي', 7);
  }

  /* VWAP للفريمات الداخلية */
  if (intraday) {
    const v = I.vwap(bars, true);
    push(v[v.length - 1], 'vwap', 'VWAP', 10);
  }

  /* القمم والقيعان السابقة — كل لمسة تزيد الوزن */
  const pivots = [...A.swings.highs.slice(-14), ...A.swings.lows.slice(-14)];
  pivots.forEach((p) => {
    push(p.price, 'pivot', p.type === 'high' ? 'قمة سابقة' : 'قاع سابق', 10);
  });

  /* مناطق السيولة */
  A.liquidity.forEach((l) => {
    push(l.price, 'liquidity', `تجمّع أوامر (${l.touches} لمسات)`, 10 + Math.min(l.touches, 4) * 2);
  });

  /* فجوات القيمة العادلة غير المردومة — الحافة والمنتصف */
  A.openFVGs.slice(-10).forEach((f) => {
    const mid = (f.top + f.bottom) / 2;
    push(mid, 'fvg', 'منتصف فجوة قيمة عادلة', 13);
    push(f.dir === 'bull' ? f.top : f.bottom, 'fvg', 'حافة فجوة قيمة عادلة', 10);
  });

  /* منطقة الأوامر */
  if (A.orderBlock) {
    push((A.orderBlock.top + A.orderBlock.bottom) / 2, 'ob', 'منتصف منطقة أوامر', 13);
  }

  /* كثافة التداول */
  volumeNodes(bars).forEach((n) =>
    push(n.price, 'volume', n.rank === 0 ? 'أعلى كثافة تداول' : 'كثافة تداول عالية', n.rank === 0 ? 15 : 10)
  );

  /* الأرقام النفسية */
  const atrArr = I.atr(bars, 14);
  const atrNow = atrArr[atrArr.length - 1] || price * 0.01;
  roundNumbers(price, atrNow).forEach((v) => push(v, 'round', 'رقم نفسي', 5));

  /* مستويات الجلسات */
  sessionLevels(bars, intraday).forEach((l) => push(l.price, l.cat, l.label, l.weight));

  return levels;
}

/* ------------------------------------------------------------------ */
/* اختبار سلوك السعر التاريخي عند المنطقة                               */
/* ------------------------------------------------------------------ */

/**
 * يعدّ كم مرة لمس السعر المنطقة سابقًا، وكم مرة ارتدّ منها فعلًا
 * (تحرّك بمقدار ATR على الأقل في الاتجاه المتوقع خلال 10 شمعات)،
 * وكم مرة اخترقها وأغلق خلفها.
 */
export function reactionStats(bars, low, high, side, atrArr, lookAhead = 10) {
  let touches = 0;
  let bounces = 0;
  let breaks = 0;
  let lastTouchIndex = null;
  const n = bars.length;
  let i = 0;

  while (i < n - 2) {
    const b = bars[i];
    const intersects = b.low <= high && b.high >= low;
    // لا نعدّ إلا الزيارات التي يقترب فيها السعر من المنطقة من جهتها الصحيحة،
    // حتى لا يُحسب التذبذب داخلها عشرات «اللمسات» بلا معنى.
    const approaching =
      i > 0 && (side === 'support' ? bars[i - 1].low > high : bars[i - 1].high < low);
    if (!intersects || !approaching) {
      i++;
      continue;
    }

    touches++;
    lastTouchIndex = i;
    const atrNow = atrArr[i] || (high - low) || b.close * 0.01;
    const end = Math.min(n - 1, i + lookAhead);

    let bounced = false;
    let broke = false;
    for (let j = i + 1; j <= end; j++) {
      if (side === 'support') {
        if (bars[j].high >= high + atrNow) {
          bounced = true;
          break;
        }
        if (bars[j].close <= low - atrNow * 0.5) {
          broke = true;
          break;
        }
      } else {
        if (bars[j].low <= low - atrNow) {
          bounced = true;
          break;
        }
        if (bars[j].close >= high + atrNow * 0.5) {
          broke = true;
          break;
        }
      }
    }
    if (bounced) bounces++;
    else if (broke) breaks++;

    // نتجاوز فترة اللمس حتى لا نعدّ نفس الزيارة مرات كثيرة
    i = Math.max(i + 1, end);
  }

  return {
    touches,
    bounces,
    breaks,
    rate: touches ? bounces / touches : 0,
    lastTouchIndex,
  };
}

/* ------------------------------------------------------------------ */
/* التجميع والتقييم                                                     */
/* ------------------------------------------------------------------ */

function clusterLevels(levels, tolerance) {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clusters = [];
  let current = null;

  for (const lv of sorted) {
    if (current && lv.price - current.min <= tolerance * 2) {
      current.items.push(lv);
      current.min = Math.min(current.min, lv.price);
      current.max = Math.max(current.max, lv.price);
    } else {
      current = { items: [lv], min: lv.price, max: lv.price };
      clusters.push(current);
    }
  }
  return clusters;
}

function scoreCluster(items) {
  // أعلى وزن داخل كل فئة + مكافأة صغيرة للتكرار داخل الفئة نفسها
  const byCat = new Map();
  items.forEach((it) => {
    const cur = byCat.get(it.cat);
    if (!cur) byCat.set(it.cat, { best: it, count: 1 });
    else {
      cur.count++;
      if (it.weight > cur.best.weight) cur.best = it;
    }
  });

  let base = 0;
  byCat.forEach((v) => {
    base += v.best.weight + Math.min(v.count - 1, 2) * 2;
  });

  // التنوّع هو جوهر الفكرة: كل فئة إضافية ترفع القوة
  const diversity = (byCat.size - 1) * 7;
  return { base, diversity, byCat };
}

/**
 * @returns { supports: [...], resistances: [...], all: [...] }
 * كل منطقة: { low, high, mid, side, strength, verdict, factors, reaction }
 */
export function findConfluence(bars, A, { intraday = false, maxPerSide = 3, minStrength = 35 } = {}) {
  if (!A || !A.ok || bars.length < 40) return { supports: [], resistances: [], all: [] };

  const price = bars[bars.length - 1].close;
  const atrArr = I.atr(bars, 14);
  const atrNow = atrArr[atrArr.length - 1] || price * 0.01;
  const tolerance = Math.max(atrNow * 0.35, price * 0.003);

  const levels = collectLevels(bars, A, { intraday });
  const clusters = clusterLevels(levels, tolerance);

  const zones = clusters
    .map((c) => {
      const mid = c.items.reduce((s, x) => s + x.price, 0) / c.items.length;
      const low = Math.min(c.min, mid - tolerance * 0.5);
      const high = Math.max(c.max, mid + tolerance * 0.5);
      const side = mid < price ? 'support' : 'resistance';

      const { base, diversity, byCat } = scoreCluster(c.items);
      if (byCat.size < 2) return null; // سبب واحد لا يصنع نقطة التقاء

      const reaction = reactionStats(bars, low, high, side, atrArr);

      // السجل التاريخي معامل ضرب وليس مكافأة: مستوى اجتمعت عنده عوامل كثيرة
      // لكن السعر اخترقه أكثر مما ارتدّ منه ليس مستوى قويًا مهما كثرت عوامله.
      const proven = reaction.touches >= 3;
      const factor = proven
        ? Math.max(0.4, Math.min(1.25, 0.35 + 1.15 * reaction.rate))
        : 0.95; // بلا سجل كافٍ: خصم بسيط لعدم التأكد

      const raw = Math.min(100, base + diversity);
      const strength = Math.max(0, Math.min(100, Math.round(raw * factor)));

      const factors = [...byCat.values()]
        .map((v) => ({
          cat: v.best.cat,
          label: v.best.label + (v.count > 1 ? ` ×${v.count}` : ''),
          weight: v.best.weight,
        }))
        .sort((a, b) => b.weight - a.weight);

      return {
        low,
        high,
        mid,
        side,
        strength,
        factors,
        catCount: byCat.size,
        reaction,
        distancePct: ((mid - price) / price) * 100,
      };
    })
    .filter(Boolean)
    .filter((z) => z.strength >= minStrength)
    // نتجاهل ما هو بعيد جدًا عن السعر
    .filter((z) => Math.abs(z.distancePct) <= 25);

  zones.forEach((z) => {
    const proven = z.reaction.touches >= 3;
    const good = z.reaction.rate >= 0.6;

    if (z.strength >= 75 && (!proven || good)) {
      z.verdict = proven
        ? 'نقطة ارتداد قوية جدًا — عوامل متعددة وسجل ارتداد مثبت'
        : 'نقطة ارتداد قوية جدًا — عوامل متعددة (لم تُختبر كثيرًا بعد)';
    } else if (z.strength >= 75) {
      z.verdict = 'عوامل كثيرة لكن السعر اخترقها أكثر مما ارتدّ منها';
    } else if (z.strength >= 58) {
      z.verdict = 'نقطة ارتداد قوية';
    } else if (z.strength >= 45) {
      z.verdict = 'نقطة ارتداد محتملة';
    } else {
      z.verdict = 'التقاء ضعيف';
    }

    z.proven = proven;
    z.reliable = z.strength >= 58 && (!proven || good);
  });

  // عند تساوي القوة نقدّم صاحب السجل الأفضل ثم الأقرب إلى السعر
  const byStrength = (a, b) =>
    b.strength - a.strength ||
    b.reaction.rate - a.reaction.rate ||
    Math.abs(a.distancePct) - Math.abs(b.distancePct);
  const supports = zones.filter((z) => z.side === 'support').sort(byStrength).slice(0, maxPerSide);
  const resistances = zones
    .filter((z) => z.side === 'resistance')
    .sort(byStrength)
    .slice(0, maxPerSide);

  return { supports, resistances, all: [...supports, ...resistances].sort(byStrength) };
}

/** هل تتقاطع منطقة الالتقاء مع منطقة الدخول المقترحة؟ */
export function zonesOverlap(a, b) {
  if (!a || !b) return false;
  const aTop = Math.max(a.high ?? a.top, a.low ?? a.bottom);
  const aBottom = Math.min(a.high ?? a.top, a.low ?? a.bottom);
  const bTop = Math.max(b.high ?? b.top, b.low ?? b.bottom);
  const bBottom = Math.min(b.high ?? b.top, b.low ?? b.bottom);
  return Math.min(aTop, bTop) >= Math.max(aBottom, bBottom);
}
