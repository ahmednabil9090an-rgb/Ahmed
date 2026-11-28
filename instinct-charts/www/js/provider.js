/*
 * طبقة مزوّد البيانات — مشتركة بين خادم الويب والتطبيق على الهاتف.
 *
 * على الويب يستدعيها الخادم (server.js) ليعمل كوسيط يتجاوز قيود CORS.
 * على الهاتف يستدعيها التطبيق مباشرة عبر طبقة الشبكة الأصلية في Capacitor،
 * فلا يحتاج التطبيق إلى أي خادم خلفي.
 */

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BASE = 'https://query2.finance.yahoo.com';

/** الفريمات: المدى المطلوب من المزوّد ومدة صلاحية الكاش */
export const TF = {
  '1m': { interval: '1m', range: '5d', ttl: 45e3 },
  '5m': { interval: '5m', range: '1mo', ttl: 60e3 },
  '15m': { interval: '15m', range: '1mo', ttl: 90e3 },
  '30m': { interval: '30m', range: '2mo', ttl: 120e3 },
  '1h': { interval: '1h', range: '2y', ttl: 180e3 },
  '4h': { interval: '1h', range: '2y', ttl: 180e3, aggregate: 4 },
  '1d': { interval: '1d', range: '10y', ttl: 300e3 },
  '1wk': { interval: '1wk', range: '10y', ttl: 600e3 },
  '1mo': { interval: '1mo', range: 'max', ttl: 900e3 },
};

export function chartUrl(symbol, tf) {
  const conf = TF[tf] || TF['1d'];
  return (
    `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${conf.interval}&range=${conf.range}&includePrePost=false&events=div%2Csplit`
  );
}

export function searchUrl(q) {
  return (
    `${BASE}/v1/finance/search?q=${encodeURIComponent(q)}` +
    '&quotesCount=12&newsCount=0&listsCount=0'
  );
}

/** الطول الزمني المتوقّع للشمعة في كل فريم (بالثواني) */
export const TF_SECONDS = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1wk': 604800,
  '1mo': 2592000,
};

/** الفارق الزمني الوسيط بين الشموع — يكشف الدقّة الحقيقية للبيانات */
export function medianGap(bars, sample = 30) {
  if (!bars || bars.length < 4) return null;
  const gaps = [];
  for (let i = Math.max(1, bars.length - sample); i < bars.length; i++) {
    const g = bars[i].time - bars[i - 1].time;
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function describeInterval(seconds) {
  if (seconds >= 6.5 * 86400) return 'أسبوعية';
  if (seconds >= 1.5 * 86400) return `كل ${Math.round(seconds / 86400)} أيام`;
  if (seconds >= 0.8 * 86400) return 'يومية';
  if (seconds >= 3600) return `كل ${Math.round(seconds / 3600)} ساعة`;
  return `كل ${Math.round(seconds / 60)} دقيقة`;
}

/**
 * المزوّد لا يوفّر بيانات داخل اليوم لكل الأدوات — فالأسهم المصرية مثلًا
 * تعود بشمعة واحدة لكل جلسة حتى عند طلب فريم الساعة. نكشف ذلك بمقارنة
 * الفارق الزمني الفعلي بالمتوقّع، ونبلّغ المستخدم بدل عرض شارت مضلِّل.
 */
export function annotateResolution(data, tf) {
  const actual = medianGap(data.bars);
  const expected = TF_SECONDS[tf] || 86400;
  data.meta.actualIntervalSeconds = actual;
  data.meta.resolutionNote =
    actual && actual >= expected * 3
      ? `المزوّد لا يوفّر شموعًا بهذه الدقّة لهذه الأداة — المعروض شموع ${describeInterval(actual)}`
      : null;
  return data;
}

/** يدمج شموع الساعة في شموع أربع ساعات */
export function aggregate(bars, factor) {
  const out = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (!chunk.length) continue;
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + (b.volume || 0), 0),
    });
  }
  return out;
}

/** يحوّل رد المزوّد إلى الشكل الذي يستخدمه التطبيق */
export function normalizeChart(json) {
  const chart = json && json.chart;
  if (!chart) throw new Error('رد غير متوقع من مزوّد البيانات');
  if (chart.error) throw new Error(chart.error.description || chart.error.code);
  const r = chart.result && chart.result[0];
  if (!r) throw new Error('لا توجد بيانات لهذا الرمز');

  const ts = r.timestamp || [];
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const bars = [];
  let repaired = 0;

  for (let i = 0; i < ts.length; i++) {
    const o = q.open ? q.open[i] : null;
    const h = q.high ? q.high[i] : null;
    const l = q.low ? q.low[i] : null;
    const c = q.close ? q.close[i] : null;
    if (o == null || h == null || l == null || c == null) continue;

    const open = +o;
    const cls = +c;
    let high = +h;
    let low = +l;

    // يرجع المزوّد لبعض الأدوات — وبكثرة في البورصة المصرية — شموعًا
    // غير متسقة يقع فيها سعر الفتح أو الإغلاق خارج مدى القمة والقاع.
    // هذا مستحيل منطقيًا، ويفسد رسم الشموع وكشف الفجوات والقمم والقيعان
    // وحساب المدى الحقيقي. نصلحه بتوسيع المدى ليشمل الجسم، وهو تصحيح
    // آمن لأن القمة لا يمكن أن تقل عن الفتح أو الإغلاق بحكم التعريف.
    const fixedHigh = Math.max(high, open, cls);
    const fixedLow = Math.min(low, open, cls);
    if (fixedHigh !== high || fixedLow !== low) repaired++;
    high = fixedHigh;
    low = fixedLow;

    bars.push({
      time: ts[i],
      open,
      high,
      low,
      close: cls,
      volume: q.volume && q.volume[i] != null ? +q.volume[i] : 0,
    });
  }

  const m = r.meta || {};
  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];

  // بعض الأدوات (خاصة في البورصة المصرية) يرجع لها المزوّد سعرًا قديمًا في
  // بيانات الـ meta بينما سلسلة الشموع محدّثة — نثق بالشموع عند الاختلاف.
  const metaPrice = m.regularMarketPrice;
  const metaTime = m.regularMarketTime;
  const metaTrusted =
    metaPrice != null &&
    lastBar != null &&
    (metaTime == null || metaTime >= lastBar.time) &&
    Math.abs(metaPrice - lastBar.close) / lastBar.close < 0.25;

  const price = metaTrusted ? metaPrice : lastBar ? lastBar.close : null;
  let changePercent = metaTrusted ? m.regularMarketChangePercent : null;
  if (changePercent == null && lastBar && prevBar && prevBar.close) {
    changePercent = ((lastBar.close - prevBar.close) / prevBar.close) * 100;
  }

  return {
    meta: {
      symbol: m.symbol,
      currency: m.currency,
      exchange: m.fullExchangeName || m.exchangeName,
      type: m.instrumentType,
      timezone: m.exchangeTimezoneName,
      gmtoffset: m.gmtoffset,
      price,
      changePercent,
      previousClose: prevBar ? prevBar.close : m.chartPreviousClose,
      lastBarTime: lastBar ? lastBar.time : null,
      quoteStale: !metaTrusted,
      repairedBars: repaired,
      dayHigh: lastBar ? lastBar.high : m.regularMarketDayHigh,
      dayLow: lastBar ? lastBar.low : m.regularMarketDayLow,
      marketTime: metaTrusted ? metaTime : lastBar ? lastBar.time : null,
      name: m.longName || m.shortName || m.symbol,
    },
    bars,
  };
}

export function normalizeSearch(json) {
  return (json.quotes || [])
    .filter((x) => x.symbol)
    .map((x) => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || x.symbol,
      exchange: x.exchDisp || x.exchange,
      type: x.typeDisp || x.quoteType,
    }));
}

/** كاش بسيط في الذاكرة يصلح للخادم وللمتصفح */
export function createCache(maxEntries = 400) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return null;
      if (Date.now() > hit.expires) {
        map.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key, value, ttlMs) {
      map.set(key, { value, expires: Date.now() + ttlMs });
      if (map.size > maxEntries) {
        [...map.keys()].slice(0, Math.floor(maxEntries / 4)).forEach((k) => map.delete(k));
      }
    },
    get size() {
      return map.size;
    },
  };
}
