/*
 * محرّك تحليل بنية السوق (Smart Money / ICT)
 *  - القمم والقيعان (Swings)
 *  - فجوات القيمة العادلة FVG
 *  - كسر وتغيّر بنية السوق BOS / MSS
 *  - مناطق الأوامر Order Blocks
 *  - السيولة (قمم/قيعان متساوية)
 *  - الفيبوناتشي: التوازن 0.5 ومنطقة الدخول المثالية OTE
 */

/* ------------------------------------------------------------------ */
/* القمم والقيعان                                                       */
/* ------------------------------------------------------------------ */

/**
 * يرصد القمم والقيعان بطريقة الفراكتال: شمعة أعلى (أو أدنى) من n شمعات
 * على كل جانب. القمة تُعتبر «مؤكدة» بعد n شمعات من تكوّنها.
 */
export function findSwings(bars, lookback = 2) {
  const highs = [];
  const lows = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: bars[i].high, time: bars[i].time, type: 'high' });
    if (isLow) lows.push({ index: i, price: bars[i].low, time: bars[i].time, type: 'low' });
  }
  return { highs, lows, all: [...highs, ...lows].sort((a, b) => a.index - b.index) };
}

/* ------------------------------------------------------------------ */
/* فجوات القيمة العادلة                                                 */
/* ------------------------------------------------------------------ */

/**
 * FVG بثلاث شمعات:
 *   صاعدة: قمة الشمعة الأولى أقل من قاع الشمعة الثالثة.
 *   هابطة: قاع الشمعة الأولى أعلى من قمة الشمعة الثالثة.
 * نُرجع كذلك حالة «الردم» (mitigation) ونسبة ما تم ردمه.
 */
export function findFVGs(bars, { minSizePct = 0.05, maxAgeBars = 400 } = {}) {
  const out = [];
  const start = Math.max(1, bars.length - maxAgeBars);
  for (let i = start; i < bars.length - 1; i++) {
    const a = bars[i - 1];
    const c = bars[i + 1];
    const mid = bars[i];

    let gap = null;
    if (a.high < c.low) gap = { dir: 'bull', from: a.high, to: c.low };
    else if (a.low > c.high) gap = { dir: 'bear', from: c.high, to: a.low };
    if (!gap) continue;

    const size = gap.to - gap.from;
    const pct = (size / mid.close) * 100;
    if (pct < minSizePct) continue;

    // قياس الردم بما حدث بعد تكوّن الفجوة
    let filled = 0;
    let fullyFilledAt = null;
    for (let j = i + 2; j < bars.length; j++) {
      const b = bars[j];
      if (gap.dir === 'bull') {
        const penetration = gap.to - Math.min(b.low, gap.to);
        filled = Math.max(filled, Math.min(penetration / size, 1));
        if (b.low <= gap.from) {
          fullyFilledAt = j;
          break;
        }
      } else {
        const penetration = Math.max(b.high, gap.from) - gap.from;
        filled = Math.max(filled, Math.min(penetration / size, 1));
        if (b.high >= gap.to) {
          fullyFilledAt = j;
          break;
        }
      }
    }

    out.push({
      kind: 'fvg',
      dir: gap.dir,
      top: gap.to,
      bottom: gap.from,
      index: i,
      time: mid.time,
      startTime: a.time,
      endTime: fullyFilledAt != null ? bars[fullyFilledAt].time : null,
      filled,
      mitigated: fullyFilledAt != null,
      sizePct: pct,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* بنية السوق: BOS / MSS                                                */
/* ------------------------------------------------------------------ */

/**
 * يمرّ على الشموع ويبني تسلسل أحداث البنية.
 * BOS = كسر في اتجاه الترند القائم (استمرار).
 * MSS = كسر عكس الترند القائم (تغيّر بنية — انعكاس محتمل).
 */
export function marketStructure(bars, lookback = 2) {
  const { highs, lows } = findSwings(bars, lookback);
  const events = [];

  let hi = null; // آخر قمة مؤكدة { index, price }
  let lo = null;
  let trend = 'neutral';
  let hIdx = 0;
  let lIdx = 0;

  for (let i = 0; i < bars.length; i++) {
    // تأكيد القمم/القيعان التي اكتملت قبل هذه الشمعة
    while (hIdx < highs.length && highs[hIdx].index + lookback <= i) {
      hi = highs[hIdx];
      hIdx++;
    }
    while (lIdx < lows.length && lows[lIdx].index + lookback <= i) {
      lo = lows[lIdx];
      lIdx++;
    }

    const close = bars[i].close;

    if (hi && close > hi.price && i > hi.index) {
      const kind = trend === 'down' ? 'MSS' : 'BOS';
      events.push({
        kind,
        dir: 'bull',
        level: hi.price,
        breakIndex: i,
        breakTime: bars[i].time,
        pivotIndex: hi.index,
        pivotTime: hi.time,
      });
      trend = 'up';
      hi = null; // تنتظر قمة جديدة
    } else if (lo && close < lo.price && i > lo.index) {
      const kind = trend === 'up' ? 'MSS' : 'BOS';
      events.push({
        kind,
        dir: 'bear',
        level: lo.price,
        breakIndex: i,
        breakTime: bars[i].time,
        pivotIndex: lo.index,
        pivotTime: lo.time,
      });
      trend = 'down';
      lo = null;
    }
  }

  return { events, trend, highs, lows };
}

/* ------------------------------------------------------------------ */
/* مناطق الأوامر                                                        */
/* ------------------------------------------------------------------ */

/** آخر شمعة معاكسة قبل الاندفاع الذي كسر البنية */
export function orderBlockFor(bars, event) {
  const wantBearCandle = event.dir === 'bull';
  for (let i = event.breakIndex; i >= Math.max(0, event.breakIndex - 30); i--) {
    const b = bars[i];
    const isBear = b.close < b.open;
    if (wantBearCandle === isBear) {
      return {
        kind: 'ob',
        dir: event.dir,
        top: Math.max(b.open, b.close, b.high),
        bottom: Math.min(b.open, b.close, b.low),
        index: i,
        time: b.time,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* السيولة: قمم/قيعان متقاربة                                           */
/* ------------------------------------------------------------------ */

export function liquidityLevels(bars, swings, tolerancePct = 0.15) {
  const groups = [];
  const consider = (points, type) => {
    const used = new Set();
    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      const base = points[i];
      const cluster = [base];
      for (let j = i + 1; j < points.length; j++) {
        if (used.has(j)) continue;
        const diff = (Math.abs(points[j].price - base.price) / base.price) * 100;
        if (diff <= tolerancePct) {
          cluster.push(points[j]);
          used.add(j);
        }
      }
      if (cluster.length >= 2) {
        groups.push({
          kind: 'liquidity',
          type,
          price: cluster.reduce((s, p) => s + p.price, 0) / cluster.length,
          touches: cluster.length,
          lastIndex: Math.max(...cluster.map((p) => p.index)),
          firstTime: Math.min(...cluster.map((p) => p.time)),
        });
      }
    }
  };
  consider(swings.highs.slice(-18), 'buyside');
  consider(swings.lows.slice(-18), 'sellside');
  return groups;
}

/* ------------------------------------------------------------------ */
/* الساق الاندفاعية والفيبوناتشي                                        */
/* ------------------------------------------------------------------ */

/**
 * يبني ساقًا اندفاعية بين شمعتين ويحسب مستويات الارتداد عليها.
 * الارتداد دائمًا عكس اتجاه الساق:
 *   ساق صاعدة → الارتداد لأسفل (منطقة شراء)
 *   ساق هابطة → الارتداد لأعلى (منطقة بيع)
 */
function makeLeg(bars, startIdx, endIdx, dir) {
  const up = dir === 'bull';
  const a = bars[startIdx];
  const b = bars[endIdx];
  const low = up
    ? { index: startIdx, price: a.low, time: a.time }
    : { index: endIdx, price: b.low, time: b.time };
  const high = up
    ? { index: endIdx, price: b.high, time: b.time }
    : { index: startIdx, price: a.high, time: a.time };

  const range = high.price - low.price;
  if (!(range > 0)) return null;

  // نسبة الارتداد r محسوبة من نهاية الساق باتجاه بدايتها
  const fib = (r) => (up ? high.price - range * r : low.price + range * r);

  const o1 = fib(0.62);
  const o2 = fib(0.79);

  return {
    dir,
    from: up ? low : high,
    to: up ? high : low,
    low,
    high,
    range,
    equilibrium: (high.price + low.price) / 2,
    ote: { top: Math.max(o1, o2), bottom: Math.min(o1, o2) },
    levels: {
      r382: fib(0.382),
      r5: fib(0.5),
      r618: fib(0.618),
      r705: fib(0.705),
      r79: fib(0.79),
    },
    ext: {
      e1272: up ? high.price + range * 0.272 : low.price - range * 0.272,
      e1618: up ? high.price + range * 0.618 : low.price - range * 0.618,
    },
  };
}

/**
 * الساق الاندفاعية المستمدة من آخر حدث بنيوي — وهي الأصحّ منهجيًا:
 * بعد كسر هابط نقيس الساق الهابطة التي سببت الكسر، فتكون منطقة الارتداد
 * فوق السعر (بيع)، والعكس بعد كسر صاعد.
 */
export function structuralImpulse(bars, lastEvent, window = 60) {
  const n = bars.length;
  if (!lastEvent || n < 10) return null;
  const bi = Math.min(lastEvent.breakIndex, n - 1);
  const from = Math.max(0, bi - window);

  if (lastEvent.dir === 'bear') {
    let hIdx = from;
    for (let i = from; i <= bi; i++) if (bars[i].high > bars[hIdx].high) hIdx = i;
    let lIdx = hIdx;
    for (let i = hIdx; i < n; i++) if (bars[i].low < bars[lIdx].low) lIdx = i;
    if (lIdx <= hIdx) return null;
    return makeLeg(bars, hIdx, lIdx, 'bear');
  }

  let lIdx = from;
  for (let i = from; i <= bi; i++) if (bars[i].low < bars[lIdx].low) lIdx = i;
  let hIdx = lIdx;
  for (let i = lIdx; i < n; i++) if (bars[i].high > bars[hIdx].high) hIdx = i;
  if (hIdx <= lIdx) return null;
  return makeLeg(bars, lIdx, hIdx, 'bull');
}

/** بديل احتياطي: أكبر ساق داخل آخر 160 شمعة حين لا يوجد حدث بنيوي */
export function lastImpulse(bars) {
  const n = bars.length;
  if (n < 10) return null;
  const windowSize = Math.min(n, 160);
  const offset = n - windowSize;
  const slice = bars.slice(offset);

  let lowIdx = 0;
  let highIdx = 0;
  slice.forEach((b, i) => {
    if (b.low < slice[lowIdx].low) lowIdx = i;
    if (b.high > slice[highIdx].high) highIdx = i;
  });

  const up = lowIdx < highIdx;
  return makeLeg(bars, offset + (up ? lowIdx : highIdx), offset + (up ? highIdx : lowIdx), up ? 'bull' : 'bear');
}

/* ------------------------------------------------------------------ */
/* التحليل الكامل                                                       */
/* ------------------------------------------------------------------ */

export function analyze(bars, options = {}) {
  const lookback = options.lookback || 2;
  if (!bars || bars.length < 20) {
    return { ok: false, reason: 'عدد الشموع غير كافٍ للتحليل' };
  }

  const structure = marketStructure(bars, lookback);
  const swings = { highs: structure.highs, lows: structure.lows };
  const fvgs = findFVGs(bars, options.fvg);
  const liquidity = liquidityLevels(bars, swings);

  const recentEvents = structure.events.slice(-12);
  const lastMSS = [...structure.events].reverse().find((e) => e.kind === 'MSS') || null;
  const lastEvent = structure.events[structure.events.length - 1] || null;

  const bias =
    structure.trend === 'up' ? 'bull' : structure.trend === 'down' ? 'bear' : 'neutral';

  const impulse = structuralImpulse(bars, lastEvent) || lastImpulse(bars);
  const ob = lastEvent ? orderBlockFor(bars, lastEvent) : null;

  const last = bars[bars.length - 1];
  // المنطقة المرتفعة/المخفّضة تُقاس دائمًا مقابل منتصف الساق
  const zone = !impulse
    ? 'unknown'
    : last.close > impulse.equilibrium
    ? 'premium'
    : 'discount';

  // الفجوات غير المردومة فقط تهمّ للتداول
  const openFVGs = fvgs.filter((f) => !f.mitigated);

  return {
    ok: true,
    bias,
    trend: structure.trend,
    events: structure.events,
    recentEvents,
    lastMSS,
    lastEvent,
    swings,
    fvgs,
    openFVGs,
    liquidity,
    impulse,
    orderBlock: ob,
    zone, // المنطقة السعرية الحالية: مرتفعة (premium) أم مخفّضة (discount)
    last,
  };
}
