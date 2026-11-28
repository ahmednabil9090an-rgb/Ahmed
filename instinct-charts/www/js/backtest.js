/*
 * اختبار الخطة على تاريخ الأداة نفسها.
 *
 * الفكرة: نرجع بالزمن إلى كل حدث بنيوي سابق، ونبني الخطة بما كان متاحًا
 * عند تلك اللحظة فقط — بلا أي شمعة لاحقة — ثم نتابع ما حدث بعدها:
 * هل عاد السعر إلى منطقة الدخول؟ وإن عاد، هل بلغ الهدف قبل الوقف؟
 *
 * الناتج نسب محسوبة من السوق لا من تقديرنا، وهي تجيب سؤال المتداول:
 * «الصفقة دي بتتحقق كام مرة من كل عشرة؟»
 *
 * حدود يجب ذكرها للمستخدم: القياس على الماضي لا يضمن المستقبل، والقواعد
 * نفسها صيغت بعد رؤية هذا التاريخ، فالنتيجة متفائلة بطبعها. وعيّنة صغيرة
 * لا تعني شيئًا، لذلك نخفي النسبة تحت حدّ أدنى من الفرص.
 */

import { analyze } from './ict.js';
import { buildPlan } from './strategy.js';
import { atr } from './indicators.js';

/** أقل عدد فرص تُعرض عنده نسبة — تحتها النسبة ضوضاء */
export const MIN_SAMPLE = 8;

/**
 * @param bars        الشموع كاملة
 * @param lookahead   كم شمعة نتابعها بعد الإشارة
 * @param minHistory  أقل تاريخ مطلوب قبل الإشارة حتى يصحّ التحليل
 */
export function backtestPlan(bars, { lookahead = 60, minHistory = 150, maxSetups = 60 } = {}) {
  if (!bars || bars.length < minHistory + lookahead + 20) {
    return { ok: false, reason: 'التاريخ المتاح أقصر من أن يُختبر' };
  }

  const base = analyze(bars);
  if (!base.ok) return { ok: false, reason: base.reason };

  // نأخذ الأحداث البنيوية كنقاط إشارة: عندها تتكوّن الخطة فعليًا
  const events = base.events.filter(
    (e) => e.breakIndex >= minHistory && e.breakIndex <= bars.length - lookahead - 1
  );
  if (!events.length) return { ok: false, reason: 'لا توجد إشارات سابقة كافية' };

  // نوزّع العيّنة على التاريخ كله بدل تكديسها في فترة واحدة
  const step = Math.max(1, Math.ceil(events.length / maxSetups));
  const picked = events.filter((_, i) => i % step === 0);

  const setups = [];

  for (const ev of picked) {
    const upto = bars.slice(0, ev.breakIndex + 1);
    const A = analyze(upto);
    if (!A.ok) continue;

    // بلا نقاط التقاء: حسابها مكلف ولا تغيّر مستويات الخطة نفسها
    const plan = buildPlan(upto, A, {}, null);
    if (!plan.ok || plan.direction === 'none' || !plan.entries.ideal || plan.stop == null) continue;

    const long = plan.direction === 'long';
    const zTop = Math.max(plan.entries.ideal.top, plan.entries.ideal.bottom);
    const zBot = Math.min(plan.entries.ideal.top, plan.entries.ideal.bottom);
    const targets = plan.targets.map((t) => t.price).filter((p) => p != null);
    if (!targets.length) continue;

    const rec = {
      index: ev.breakIndex,
      time: bars[ev.breakIndex].time,
      direction: plan.direction,
      reachedEntry: false,
      barsToEntry: null,
      hit: targets.map(() => false),
      barsToTarget: targets.map(() => null),
      stopped: false,
      rMultiple: null,
    };

    const end = Math.min(bars.length - 1, ev.breakIndex + lookahead);
    let entryIndex = null;

    for (let j = ev.breakIndex + 1; j <= end; j++) {
      const b = bars[j];

      // المرحلة الأولى: هل لمس السعر منطقة الدخول؟
      if (entryIndex == null) {
        const touched = b.low <= zTop && b.high >= zBot;
        if (touched) {
          entryIndex = j;
          rec.reachedEntry = true;
          rec.barsToEntry = j - ev.breakIndex;
        }
        continue;
      }

      // المرحلة الثانية: الوقف أولًا أم الهدف؟
      const stopHit = long ? b.low <= plan.stop : b.high >= plan.stop;
      if (stopHit) {
        rec.stopped = true;
        break;
      }
      targets.forEach((tp, k) => {
        if (rec.hit[k]) return;
        const reached = long ? b.high >= tp : b.low <= tp;
        if (reached) {
          rec.hit[k] = true;
          rec.barsToTarget[k] = j - entryIndex;
        }
      });
      if (rec.hit.every(Boolean)) break;
    }

    // العائد بوحدات المخاطرة: الهدف الأبعد المتحقق، وإلا −1 عند الوقف
    if (rec.reachedEntry) {
      const entryPrice = long ? zTop : zBot;
      const risk = Math.abs(entryPrice - plan.stop);
      if (risk > 0) {
        const lastHit = rec.hit.lastIndexOf(true);
        if (lastHit >= 0) {
          rec.rMultiple = Math.abs(targets[lastHit] - entryPrice) / risk;
        } else if (rec.stopped) {
          rec.rMultiple = -1;
        } else {
          // دخلت ولم تُحسم خلال فترة المتابعة: تُقاس بما بلغه السعر فعلًا
          // عند نهاية المتابعة، لا تُستبعد — استبعادها يرفع المتوسط زورًا.
          const endBar = bars[Math.min(bars.length - 1, ev.breakIndex + lookahead)];
          rec.rMultiple = ((long ? endBar.close - entryPrice : entryPrice - endBar.close) / risk);
          rec.unresolved = true;
        }
      }
    }

    setups.push(rec);
  }

  if (!setups.length) return { ok: false, reason: 'لم تتكوّن خطط صالحة في التاريخ' };

  /* ---------------- التجميع ---------------- */

  const entered = setups.filter((s) => s.reachedEntry);
  const med = (arr) => {
    const v = arr.filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };

  // المقام واحد لكل الأهداف: كل الدخولات. لو اختلف المقام بين هدف وآخر
  // خرجت نسبة الهدف الأبعد أعلى من الأقرب أحيانًا، وهو ما يبدو خطأ للقارئ.
  // الصفقة التي لم تُعرِّف هدفًا بعيدًا تُحسب ببساطة أنها لم تبلغه.
  const maxTargets = Math.max(...setups.map((s) => s.hit.length));
  const targets = [];
  for (let k = 0; k < maxTargets; k++) {
    const hits = entered.filter((s) => s.hit[k]).length;
    targets.push({
      index: k + 1,
      sample: entered.length,
      hits,
      rate: entered.length ? hits / entered.length : null,
      medianBars: med(entered.map((s) => s.barsToTarget[k])),
    });
  }

  const stopped = entered.filter((s) => s.stopped && !s.hit[0]).length;
  const rs = entered.map((s) => s.rMultiple).filter((x) => x != null);
  const expectancy = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;

  const atrArr = atr(bars, 14);

  return {
    ok: true,
    setups: setups.length,
    lookahead,
    entryReach: {
      sample: setups.length,
      count: entered.length,
      rate: entered.length / setups.length,
      medianBars: med(setups.map((s) => s.barsToEntry)),
    },
    targets,
    stopFirst: {
      sample: entered.length,
      count: stopped,
      rate: entered.length ? stopped / entered.length : null,
    },
    expectancyR: expectancy,
    atrNow: atrArr[atrArr.length - 1],
    enough: setups.length >= MIN_SAMPLE,
  };
}

/** كم جلسة متوقّعة ليقطع السعر هذه المسافة، بمقياس حركته المعتادة */
export function sessionsAway(distance, atrNow) {
  if (!atrNow || !isFinite(distance)) return null;
  return Math.abs(distance) / atrNow;
}

/** وصف قرب الصفقة بكلمات */
export function proximityLabel(sessions) {
  if (sessions == null) return null;
  if (sessions <= 0.4) return { text: 'عند السعر الآن', tone: 'now' };
  if (sessions <= 1.5) return { text: 'قريبة جدًا', tone: 'near' };
  if (sessions <= 4) return { text: 'قريبة', tone: 'near' };
  if (sessions <= 10) return { text: 'متوسطة البعد', tone: 'mid' };
  return { text: 'بعيدة', tone: 'far' };
}
