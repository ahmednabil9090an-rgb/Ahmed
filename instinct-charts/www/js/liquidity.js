/*
 * محرّك السيولة والتدفّق النقدي.
 *
 * السؤال الذي يجيب عنه: هل الفلوس داخلة على الأداة أم خارجة منها،
 * وهل حركة السعر مسنودة بسيولة حقيقية أم شكلية؟
 *
 * ملاحظة على الوحدات: في الأسهم حجم التداول عدد أسهم، فضربه في السعر
 * يعطي قيمة تداول حقيقية بالعملة. أما في العقود الآجلة فالحجم عدد عقود
 * لكل منها مضاعف خاص، فضربه في السعر لا يعطي قيمة نقدية صحيحة — لذلك
 * نعرض عدد العقود كما هو ولا ندّعي أنه مبلغ.
 */

/** هل يصح التعبير عن النشاط بقيمة نقدية؟ العقود الآجلة لا يصح فيها ذلك */
export function turnoverUnit(symbol) {
  return /=F$/i.test(String(symbol || '')) ? 'contracts' : 'currency';
}

/* ------------------------------------------------------------------ */
/* حسابات أساسية                                                        */
/* ------------------------------------------------------------------ */

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** ميل خط الانحدار البسيط، منسوبًا إلى متوسط القيمة ليكون قابلًا للمقارنة */
function normalizedSlope(values) {
  const n = values.length;
  if (n < 3) return 0;
  const avg = mean(values);
  if (!avg) return 0;
  const xBar = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xBar) * (values[i] - avg);
    den += (i - xBar) ** 2;
  }
  if (!den) return 0;
  return (num / den / Math.abs(avg)) * n; // التغير النسبي عبر النافذة كلها
}

/** قيمة التداول لكل شمعة: الحجم × السعر النموذجي */
export function turnoverSeries(bars) {
  return bars.map((b) => (b.volume || 0) * ((b.high + b.low + b.close) / 3));
}

/** الرصيد الحجمي التراكمي On-Balance Volume */
export function obv(bars) {
  const out = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const v = bars[i].volume || 0;
    const d = bars[i].close - bars[i - 1].close;
    out[i] = out[i - 1] + (d > 0 ? v : d < 0 ? -v : 0);
  }
  return out;
}

/** تدفّق الأموال لتشايكن: من −1 (تصريف تام) إلى +1 (تجميع تام) */
export function chaikinMoneyFlow(bars, period = 20) {
  const out = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let mfv = 0;
    let vol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const b = bars[j];
      const range = b.high - b.low;
      const mult = range === 0 ? 0 : (b.close - b.low - (b.high - b.close)) / range;
      mfv += mult * (b.volume || 0);
      vol += b.volume || 0;
    }
    out[i] = vol === 0 ? null : mfv / vol;
  }
  return out;
}

/** مؤشر تدفّق الأموال MFI: مثل RSI لكنه يزن الحركة بالحجم */
export function moneyFlowIndex(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const raw = bars.map((b, i) => tp[i] * (b.volume || 0));

  for (let i = period; i < bars.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += raw[j];
      else if (tp[j] < tp[j - 1]) neg += raw[j];
    }
    if (pos + neg === 0) out[i] = null;
    else if (neg === 0) out[i] = 100;
    else out[i] = 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* التحليل الكامل                                                       */
/* ------------------------------------------------------------------ */

export function analyzeLiquidity(bars, { symbol, currency } = {}) {
  if (!bars || bars.length < 30) {
    return { ok: false, reason: 'عدد الشموع غير كافٍ لتحليل السيولة' };
  }

  const hasVolume = bars.slice(-60).some((b) => (b.volume || 0) > 0);
  if (!hasVolume) {
    return { ok: false, reason: 'المزوّد لا يوفّر بيانات أحجام لهذه الأداة' };
  }

  const unit = turnoverUnit(symbol);
  const turnover = turnoverSeries(bars);
  const volumes = bars.map((b) => b.volume || 0);
  // في العقود الآجلة نقيس النشاط بعدد العقود لا بقيمة نقدية مُتوهَّمة
  const activity = unit === 'currency' ? turnover : volumes;

  const last = bars.length - 1;
  const take = (n) => activity.slice(Math.max(0, bars.length - n));

  const avg5 = mean(take(5));
  const avg20 = mean(take(20));
  const avg60 = mean(take(60));
  const today = activity[last];

  /* ----- اتجاه السيولة ----- */
  const pct5v20 = avg20 ? ((avg5 - avg20) / avg20) * 100 : 0;
  const pct20v60 = avg60 ? ((avg20 - avg60) / avg60) * 100 : 0;
  const direction = pct5v20 > 15 ? 'up' : pct5v20 < -15 ? 'down' : 'flat';
  const trendLabel =
    direction === 'up'
      ? 'السيولة تزيد'
      : direction === 'down'
      ? 'السيولة تنخفض'
      : 'السيولة مستقرة';

  /* ----- صافي التدفّق: على أي الجانبين تداولت الأموال؟ ----- */
  const flowWindow = Math.min(20, bars.length - 1);
  let inflow = 0;
  let outflow = 0;
  for (let i = bars.length - flowWindow; i < bars.length; i++) {
    const up = bars[i].close >= bars[i].open;
    if (up) inflow += activity[i];
    else outflow += activity[i];
  }
  const netFlow = inflow - outflow;
  const totalFlow = inflow + outflow;
  const inflowShare = totalFlow ? (inflow / totalFlow) * 100 : 50;

  /* ----- مؤشرات التدفّق ----- */
  const cmfArr = chaikinMoneyFlow(bars, 20);
  const cmf = cmfArr[last];
  const mfiArr = moneyFlowIndex(bars, 14);
  const mfi = mfiArr[last];
  const obvArr = obv(bars);

  /* ----- تجميع أم تصريف؟ مقارنة ميل السعر بميل الرصيد الحجمي ----- */
  const win = Math.min(30, bars.length);
  const priceSlope = normalizedSlope(bars.slice(-win).map((b) => b.close));
  const obvTail = obvArr.slice(-win);
  const obvRange = Math.max(...obvTail) - Math.min(...obvTail);
  // الرصيد التراكمي قد يمرّ بالسالب، فلا معنى لنسبة ميله إلى متوسطه.
  // ننسب صافي تغيّره عبر النافذة إلى مداها، فتخرج قيمة بين −1 و +1.
  const obvSlope = obvRange ? (obvTail[obvTail.length - 1] - obvTail[0]) / obvRange : 0;

  let accumulation;
  if (priceSlope < -0.02 && obvSlope > 0.15) {
    accumulation = {
      verdict: 'تجميع مخفي',
      detail: 'السعر ينزل بينما الرصيد الحجمي يصعد — شراء هادئ تحت ضغط البيع.',
      tone: 'good',
    };
  } else if (priceSlope > 0.02 && obvSlope < -0.15) {
    accumulation = {
      verdict: 'تصريف مخفي',
      detail: 'السعر يصعد بينما الرصيد الحجمي ينزل — الصعود غير مسنود بسيولة.',
      tone: 'bad',
    };
  } else if (priceSlope > 0.02 && obvSlope > 0.15) {
    accumulation = {
      verdict: 'صعود مسنود بالسيولة',
      detail: 'السعر والرصيد الحجمي يصعدان معًا.',
      tone: 'good',
    };
  } else if (priceSlope < -0.02 && obvSlope < -0.15) {
    accumulation = {
      verdict: 'هبوط مسنود بالسيولة',
      detail: 'السعر والرصيد الحجمي ينزلان معًا — ضغط بيع حقيقي.',
      tone: 'bad',
    };
  } else {
    accumulation = { verdict: 'بلا إشارة واضحة', detail: 'لا تباعد معتبرًا بين السعر والسيولة.', tone: 'flat' };
  }

  /* ----- أيام السيولة الاستثنائية ----- */
  const bigDays = [];
  for (let i = Math.max(20, bars.length - 60); i < bars.length; i++) {
    const base = mean(activity.slice(i - 20, i));
    if (!base) continue;
    const x = activity[i] / base;
    if (x >= 2) {
      bigDays.push({
        index: i,
        time: bars[i].time,
        value: activity[i],
        times: x,
        dir: bars[i].close >= bars[i].open ? 'up' : 'down',
      });
    }
  }
  bigDays.sort((a, b) => b.times - a.times);

  /* ----- هل الأداة قابلة للتداول بحجمك؟ ----- */
  // قاعدة متحفّظة: البقاء تحت 1٪ من متوسط التداول اليومي يقلّل أثرك على السعر
  const positionHint = unit === 'currency' ? avg20 * 0.01 : null;
  const depth =
    unit !== 'currency'
      ? null
      : avg20 >= 50e6
      ? { level: 'عالية', note: 'الدخول والخروج سهل حتى بمبالغ كبيرة.' }
      : avg20 >= 10e6
      ? { level: 'متوسطة', note: 'مناسبة لمعظم المراكز الفردية.' }
      : avg20 >= 2e6
      ? { level: 'محدودة', note: 'احذر من فروق السعر عند الدخول والخروج.' }
      : { level: 'ضعيفة', note: 'قد يصعب الخروج بسرعة دون التأثير على السعر.' };

  /* ----- الملخّص ----- */
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■';
  const summary =
    `${arrow} ${trendLabel}: متوسط آخر 5 جلسات ${pct5v20 >= 0 ? 'أعلى' : 'أقل'} بنسبة ` +
    `${Math.abs(pct5v20).toFixed(0)}٪ من متوسط 20 جلسة. ` +
    `التداول في آخر ${flowWindow} جلسة كان ${inflowShare.toFixed(0)}٪ منه على جلسات صاعدة، ` +
    `أي ${netFlow >= 0 ? 'صافي دخول' : 'صافي خروج'}. ${accumulation.verdict}: ${accumulation.detail}`;

  return {
    ok: true,
    unit,
    currency,
    activity,
    turnover,
    today,
    todayVsAvgPct: avg20 ? ((today - avg20) / avg20) * 100 : 0,
    avg5,
    avg20,
    avg60,
    trend: { pct5v20, pct20v60, direction, label: trendLabel },
    flow: { inflow, outflow, netFlow, inflowShare, window: flowWindow },
    cmf,
    mfi,
    obv: obvArr,
    obvSlope,
    priceSlope,
    accumulation,
    bigDays: bigDays.slice(0, 5),
    positionHint,
    depth,
    summary,
  };
}

/* ------------------------------------------------------------------ */
/* عرض الأرقام                                                          */
/* ------------------------------------------------------------------ */

const CURRENCY_NAME = { EGP: 'جنيه', USD: 'دولار', EUR: 'يورو', GBp: 'بنس', GBP: 'إسترليني' };

/** يختصر الأرقام الكبيرة: 1,240,000 ← 1.24 مليون */
export function compactNumber(v) {
  const a = Math.abs(v);
  if (!isFinite(v)) return '—';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + ' مليار';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + ' مليون';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + ' ألف';
  return v.toFixed(0);
}

/** يصوغ قيمة النشاط بوحدتها الصحيحة */
export function formatActivity(v, unit, currency) {
  if (v == null || !isFinite(v)) return '—';
  if (unit === 'contracts') return `${compactNumber(v)} عقد`;
  const name = CURRENCY_NAME[currency] || currency || '';
  return `${compactNumber(v)}${name ? ' ' + name : ''}`;
}
