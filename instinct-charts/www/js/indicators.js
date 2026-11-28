/* المؤشرات الفنية — كل دالة تُرجع مصفوفة بنفس طول المدخلات (null أثناء فترة التسخين) */

export const closes = (bars) => bars.map((b) => b.close);
export const hlc3 = (bars) => bars.map((b) => (b.high + b.low + b.close) / 3);

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count++;
    if (count > period) {
      sum -= values[i - period];
      count = period;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** متوسط Wilder (المستخدم في RSI و ATR) */
function rma(values, period) {
  const out = new Array(values.length).fill(null);
  let prev = null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      sum += v;
      count++;
      if (count === period) {
        prev = sum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (period - 1) + v) / period;
    out[i] = prev;
  }
  return out;
}

export function rsi(values, period = 14) {
  const gains = new Array(values.length).fill(null);
  const losses = new Array(values.length).fill(null);
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    gains[i] = Math.max(diff, 0);
    losses[i] = Math.max(-diff, 0);
  }
  const ag = rma(gains, period);
  const al = rma(losses, period);
  return values.map((_, i) => {
    if (ag[i] == null || al[i] == null) return null;
    if (al[i] === 0) return 100;
    const rs = ag[i] / al[i];
    return 100 - 100 / (1 + rs);
  });
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
  const signal = ema(line, signalPeriod);
  const hist = line.map((v, i) => (v == null || signal[i] == null ? null : v - signal[i]));
  return { line, signal, hist };
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (mid[i] == null) continue;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += Math.pow(values[j] - mid[i], 2);
    const sd = Math.sqrt(acc / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

export function atr(bars, period = 14) {
  const tr = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
  return rma(tr, period);
}

/** VWAP — يُصفَّر مع بداية كل يوم في الفريمات الداخلية */
export function vwap(bars, intraday = true) {
  const out = new Array(bars.length).fill(null);
  let pv = 0;
  let vol = 0;
  let day = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = new Date(b.time * 1000).toISOString().slice(0, 10);
    if (intraday && d !== day) {
      pv = 0;
      vol = 0;
      day = d;
    }
    const typical = (b.high + b.low + b.close) / 3;
    const v = b.volume || 1;
    pv += typical * v;
    vol += v;
    out[i] = vol ? pv / vol : null;
  }
  return out;
}

/** WaveTrend — نسخة LazyBear المعروفة */
export function waveTrend(bars, n1 = 10, n2 = 21) {
  const ap = hlc3(bars);
  const esa = ema(ap, n1);
  const dev = ap.map((v, i) => (esa[i] == null ? null : Math.abs(v - esa[i])));
  const d = ema(dev, n1);
  const ci = ap.map((v, i) =>
    esa[i] == null || d[i] == null || d[i] === 0 ? null : (v - esa[i]) / (0.015 * d[i])
  );
  const wt1 = ema(ci, n2);
  const wt2 = sma(wt1, 4);
  return { wt1, wt2 };
}

export function stochastic(bars, kPeriod = 14, dPeriod = 3) {
  const k = new Array(bars.length).fill(null);
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, bars[j].high);
      lo = Math.min(lo, bars[j].low);
    }
    k[i] = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
  }
  return { k, d: sma(k, dPeriod) };
}

/** مقارنة حجم التداول بمتوسطه — تُستخدم لوصف الحجم بأنه مرتفع/منخفض */
export function volumeProfileFlag(bars, period = 20) {
  const vols = bars.map((b) => b.volume || 0);
  const avg = sma(vols, period);
  return bars.map((b, i) => {
    if (avg[i] == null || avg[i] === 0) return null;
    const ratio = (b.volume || 0) / avg[i];
    if (ratio >= 1.8) return 'مرتفع جدًا';
    if (ratio >= 1.25) return 'مرتفع';
    if (ratio <= 0.6) return 'منخفض';
    return 'طبيعي';
  });
}

export const INDICATOR_DEFS = [
  { id: 'ema20', label: 'EMA 20', pane: 'price', color: '#2bb673' },
  { id: 'ema50', label: 'EMA 50', pane: 'price', color: '#f0a33c' },
  { id: 'ema200', label: 'EMA 200', pane: 'price', color: '#e05c5c' },
  { id: 'bb', label: 'بولينجر', pane: 'price', color: '#8a8fa3' },
  { id: 'vwap', label: 'VWAP', pane: 'price', color: '#7a5cf0' },
  { id: 'volume', label: 'الأحجام', pane: 'sub', color: '#6b7280' },
  { id: 'rsi', label: 'RSI', pane: 'sub', color: '#7a5cf0' },
  { id: 'macd', label: 'MACD', pane: 'sub', color: '#2563eb' },
  { id: 'wt', label: 'WaveTrend', pane: 'sub', color: '#2563eb' },
];
