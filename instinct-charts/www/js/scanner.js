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

/** يبني سطر الفرصة لأداة واحدة */
export function buildRow(symbol, name, data, { withBacktest = true } = {}) {
  const bars = data && data.bars;
  if (!bars || bars.length < 60) return null;

  const A = analyze(bars);
  if (!A.ok) return null;

  // بلا نقاط التقاء: أثقل جزء، ولا يغيّر مستويات الصفقة نفسها
  const plan = buildPlan(bars, A, {}, null);
  if (!plan.ok || plan.direction === 'none') return null;
  if (!plan.entries.ideal || !plan.targets.length) return null;

  const t1 = plan.targets[0];
  const entryMid = (plan.entries.ideal.bottom + plan.entries.ideal.top) / 2;
  // صفقة حركتها أقل من 1٪ لا تستحق العرض: العمولات والفروق تأكلها
  if (!entryMid || Math.abs((t1.price - entryMid) / entryMid) * 100 < 1) return null;
  const bt = withBacktest ? backtestPlan(bars) : null;
  const liq = analyzeLiquidity(bars, { symbol, currency: data.meta?.currency });

  return {
    symbol,
    name,
    currency: data.meta?.currency,
    price: plan.price,
    direction: plan.direction,
    side: plan.sideWord,
    entryLow: Math.min(plan.entries.ideal.bottom, plan.entries.ideal.top),
    entryHigh: Math.max(plan.entries.ideal.bottom, plan.entries.ideal.top),
    targetLow: t1.low,
    targetHigh: t1.high,
    stop: plan.stop,
    rr: plan.rr.ideal,
    confidence: plan.confidence,
    distancePct: plan.entryDistance ? plan.entryDistance.pct : null,
    sessions: plan.entryDistance ? plan.entryDistance.sessions : null,
    inside: plan.entryDistance ? plan.entryDistance.inside : false,
    movePct: ((t1.price - (plan.entries.ideal.bottom + plan.entries.ideal.top) / 2) /
      ((plan.entries.ideal.bottom + plan.entries.ideal.top) / 2)) * 100,
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
export async function scanAll(items, getSeries, { tf = '1d', withBacktest = true, onProgress, signal } = {}) {
  const rows = [];
  let done = 0;

  for (const it of items) {
    if (signal && signal.aborted) break;
    try {
      const data = await getSeries(it.symbol, tf);
      const row = buildRow(it.symbol, it.ar || it.symbol, data, { withBacktest });
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
