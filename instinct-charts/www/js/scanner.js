/*
 * ماسح الفرص: يمرّ على كل الأدوات ويلخّص صفقة كل واحدة في سطر واحد
 * يُقرأ بنظرة: «من كذا إلى كذا».
 *
 * «من» = منطقة الدخول.  «إلى» = مدى الهدف الأول.
 * ومعهما الوقف، وبُعد الدخول عن السعر، ونسبة تحقّق الهدف تاريخيًا.
 *
 * المسح عملية ثقيلة نسبيًا (تحليل كامل + اختبار تاريخي لكل أداة)، لذلك
 * يسلّم نتائجه تباعًا ويفسح المجال للمتصفح بين كل دفعة حتى لا تتجمّد الواجهة.
 */

import { analyze } from './ict.js';
import { buildPlan } from './strategy.js';
import { backtestPlan } from './backtest.js';
import { analyzeLiquidity } from './liquidity.js';
import { findConfluence } from './confluence.js';

/*
 * شروط «الفرصة الحقيقية»: ليست خطة نظرية على الورق، بل سهم واقف الآن
 * عند مستوى اجتمعت عنده عدة أسباب، وسبق أن ارتدّ منه فعلًا أكثر مما كُسر.
 * الشروط متشدّدة عمدًا — قائمة قصيرة صادقة أنفع من قائمة طويلة متساهلة،
 * و«لا توجد فرص اليوم» إجابة صحيحة.
 */
export const REAL = {
  minStrength: 60, // قوة منطقة الالتقاء
  minFactors: 3, // عدد الأسباب المستقلة
  minTouches: 3, // لا حكم على منطقة لم تُختبر
  minBounceRate: 0.6, // ارتدّ منها أكثر مما كُسرت
  minRR: 1.5, // عائد يستحق المخاطرة
  minAdtv: 1e6, // سيولة تسمح بالدخول والخروج
  nearAtr: 0.5, // «واقف عندها» = داخلها أو على بعد نصف مدى يومي
};

/** يبني سطر الفرصة لأداة واحدة */
function roundSmart(p) {
  if (p == null || !isFinite(p)) return null;
  const a = Math.abs(p);
  if (a >= 100) return +p.toFixed(2);
  if (a >= 1) return +p.toFixed(3);
  return +p.toFixed(4);
}

export function buildRow(symbol, name, data, { withBacktest = true, withConfluence = true } = {}) {
  const bars = data && data.bars;
  if (!bars || bars.length < 60) return null;

  const A = analyze(bars);
  if (!A.ok) return null;

  const conf = withConfluence ? findConfluence(bars, A, {}) : null;
  const plan = buildPlan(bars, A, {}, conf);
  if (!plan.ok || plan.direction === 'none') return null;
  if (!plan.entries.ideal || !plan.targets.length) return null;

  const t1 = plan.targets[0];
  const entryMid = (plan.entries.ideal.bottom + plan.entries.ideal.top) / 2;
  // صفقة حركتها أقل من 1٪ لا تستحق العرض: العمولات والفروق تأكلها
  if (!entryMid || Math.abs((t1.price - entryMid) / entryMid) * 100 < 1) return null;
  const bt = withBacktest ? backtestPlan(bars) : null;
  const liq = analyzeLiquidity(bars, { symbol, currency: data.meta?.currency });

  /* ---- هل السهم واقف الآن عند مستوى مثبت؟ ---- */
  const side = conf ? (plan.direction === 'long' ? conf.supports : conf.resistances) : [];
  const tol = (plan.atr || 0) * REAL.nearAtr;
  const zone = side.find((z) => plan.price >= z.low - tol && plan.price <= z.high + tol) || null;

  const adtv = liq.ok ? liq.avg20 : null;

  /* ---- الصفقة تُبنى من المستوى الذي يقف عنده السعر الآن ----
     الخطة العامة تفترض عودة السعر إلى منطقة ارتداد مثالية قد تكون بعيدة،
     أما الفرصة الحقيقية فمعناها أن السهم عند مستوى مثبت هذه اللحظة. فلا
     معنى لأن نقول «واقف على دعم 134» ثم «ادخل من 118» — الدخول من هنا،
     والوقف خلف المستوى، والهدف أول مستوى بعده. */
  let entryLow = Math.min(plan.entries.ideal.bottom, plan.entries.ideal.top);
  let entryHigh = Math.max(plan.entries.ideal.bottom, plan.entries.ideal.top);
  let stop = plan.stop;
  let target = plan.targets[0];
  let rr = plan.rr.ideal;
  let fromZone = false;

  if (zone) {
    const long = plan.direction === 'long';
    const pad = (plan.atr || 0) * 0.4;
    const zEntry = (zone.low + zone.high) / 2;
    const zStop = long ? zone.low - pad : zone.high + pad;

    // الهدف: أول هدف في الخطة يقع خلف المستوى، وإلا أقرب منطقة مقابلة
    const beyond = (p) => (long ? p > zone.high : p < zone.low);
    const opposite = long ? conf.resistances : conf.supports;
    const altZone = opposite.filter((z) => beyond((z.low + z.high) / 2)).sort(
      (a, b) => (long ? a.low - b.low : b.high - a.high)
    )[0];

    // نجمع كل الأهداف الممكنة ونأخذ الأقرب: امتداد فيبوناتشي لساق كبيرة
    // قد يبعد عشرات بالمئة، وهدف كهذا ليس صفقة ارتداد بل أمنية.
    const candidates = [];
    plan.targets.forEach((x) => {
      if (beyond(x.price)) candidates.push({ low: x.low, high: x.high, price: x.price, label: x.label });
    });
    if (altZone) {
      candidates.push({
        low: altZone.low,
        high: altZone.high,
        price: (altZone.low + altZone.high) / 2,
        label: `منطقة التقاء بقوة ${altZone.strength}`,
      });
    }
    const maxMove = Math.max(0.3, ((plan.atr || 0) * 12) / zEntry); // سقف منطقي للحركة
    const chosen =
      candidates
        .filter((c) => Math.abs(c.price - zEntry) / zEntry <= maxMove)
        .sort((a, b) => Math.abs(a.price - zEntry) - Math.abs(b.price - zEntry))[0] || null;

    const risk = Math.abs(zEntry - zStop);
    if (chosen && risk > 0) {
      entryLow = zone.low;
      entryHigh = zone.high;
      stop = zStop;
      target = chosen;
      rr = +(Math.abs(chosen.price - zEntry) / risk).toFixed(2);
      fromZone = true;
    }
  }

  const isReal =
    !!zone &&
    fromZone &&
    zone.strength >= REAL.minStrength &&
    zone.catCount >= REAL.minFactors &&
    zone.reaction.touches >= REAL.minTouches &&
    zone.reaction.rate >= REAL.minBounceRate &&
    (rr ?? 0) >= REAL.minRR &&
    // المعادن تُقاس بالعقود فلا يصح قياس سيولتها بحدّ نقدي
    (liq.unit !== 'currency' || (adtv ?? 0) >= REAL.minAdtv);

  const entryMidFinal = (entryLow + entryHigh) / 2;

  // ترتيب الفرص الحقيقية: قوة المستوى، ثم سجل ارتداده، ثم العائد
  const quality = zone
    ? Math.round(
        zone.strength * 0.5 + zone.reaction.rate * 100 * 0.3 + (Math.min(rr ?? 0, 5) / 5) * 100 * 0.2
      )
    : 0;

  return {
    zone: zone
      ? {
          low: zone.low,
          high: zone.high,
          strength: zone.strength,
          factors: zone.catCount,
          bounces: zone.reaction.bounces,
          touches: zone.reaction.touches,
          rate: zone.reaction.rate,
          topFactors: zone.factors.slice(0, 3).map((f) => f.label),
        }
      : null,
    isReal,
    quality,
    symbol,
    name,
    currency: data.meta?.currency,
    price: plan.price,
    direction: plan.direction,
    side: plan.sideWord,
    entryLow: roundSmart(entryLow),
    entryHigh: roundSmart(entryHigh),
    targetLow: roundSmart(target.low),
    targetHigh: roundSmart(target.high),
    stop: roundSmart(stop),
    rr,
    tradeFromZone: fromZone,
    confidence: plan.confidence,
    distancePct: ((entryMidFinal - plan.price) / plan.price) * 100,
    sessions: plan.atr ? Math.abs(entryMidFinal - plan.price) / plan.atr : null,
    inside: plan.price >= entryLow && plan.price <= entryHigh,
    movePct: ((target.price - entryMidFinal) / entryMidFinal) * 100,
    hitRate: bt && bt.ok && bt.enough && bt.targets[0] ? bt.targets[0].rate : null,
    hitSample: bt && bt.ok && bt.enough && bt.targets[0] ? bt.targets[0].sample : null,
    reachRate: bt && bt.ok && bt.enough ? bt.entryReach.rate : null,
    liquidityTrend: liq.ok ? liq.trend.direction : null,
    adtv: liq.ok ? liq.avg20 : null,
  };
}

/**
 * يمسح قائمة أدوات.
 * @param getSeries  دالة تُرجع بيانات الأداة (من الشبكة أو من اللقطة)
 */
export async function scanAll(items, getSeries, { tf = '1d', withBacktest = true, withConfluence = true, onProgress, signal } = {}) {
  const rows = [];
  let done = 0;

  for (const it of items) {
    if (signal && signal.aborted) break;
    try {
      const data = await getSeries(it.symbol, tf);
      const row = buildRow(it.symbol, it.ar || it.symbol, data, { withBacktest, withConfluence });
      if (row) rows.push(row);
    } catch {
      /* أداة تعذّر جلبها — نتخطاها بهدوء */
    }
    done++;
    if (onProgress) onProgress(done, items.length, rows.length);
    // نفسح المجال للمتصفح كي يبقى التمرير والضغط سلسين أثناء المسح
    if (done % 3 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return rows;
}

export const SORTS = {
  quality: {
    label: 'الأقوى تأكيدًا',
    fn: (a, b) => (b.quality ?? 0) - (a.quality ?? 0),
  },
  nearest: {
    label: 'الأقرب للدخول',
    fn: (a, b) => Math.abs(a.sessions ?? 99) - Math.abs(b.sessions ?? 99),
  },
  hit: {
    label: 'الأعلى تحقّقًا',
    fn: (a, b) => (b.hitRate ?? -1) - (a.hitRate ?? -1),
  },
  rr: {
    label: 'الأعلى عائدًا',
    fn: (a, b) => (b.rr ?? -1) - (a.rr ?? -1),
  },
  move: {
    label: 'الأكبر حركة',
    fn: (a, b) => Math.abs(b.movePct ?? 0) - Math.abs(a.movePct ?? 0),
  },
  liquidity: {
    label: 'الأعلى سيولة',
    fn: (a, b) => (b.adtv ?? 0) - (a.adtv ?? 0),
  },
};
