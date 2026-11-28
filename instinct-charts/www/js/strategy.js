/*
 * بناء خطة التداول من نتائج التحليل:
 *   دخول مبكر / دخول مثالي / دخول مؤكد / وقف الخسارة / الأهداف
 * مع درجة ثقة مبنية على قائمة تحقّق واضحة.
 */

import { atr, ema, rsi, closes } from './indicators.js';
import { zonesOverlap } from './confluence.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** تقريب السعر حسب حجمه حتى تبقى الأرقام مقروءة */
export function roundPrice(p) {
  if (p == null || !isFinite(p)) return null;
  const a = Math.abs(p);
  if (a >= 1000) return +p.toFixed(1);
  if (a >= 100) return +p.toFixed(2);
  if (a >= 10) return +p.toFixed(2);
  if (a >= 1) return +p.toFixed(3);
  return +p.toFixed(4);
}

/** تقاطع منطقتين سعريتين */
function overlap(a, b) {
  if (!a || !b) return null;
  const top = Math.min(a.top, b.top);
  const bottom = Math.max(a.bottom, b.bottom);
  return top > bottom ? { top, bottom } : null;
}

/**
 * @param bars   شموع الفريم الحالي
 * @param A      نتيجة analyze() للفريم الحالي
 * @param htf    { '1d': analysisResult, '1wk': analysisResult } للتوافق بين الأطر
 * @param conf   نتيجة findConfluence() لتعزيز منطقة الدخول بنقاط الالتقاء
 */
export function buildPlan(bars, A, htf = {}, conf = null) {
  if (!A || !A.ok) return { ok: false, reason: (A && A.reason) || 'تحليل غير متاح' };

  const last = bars[bars.length - 1];
  const price = last.close;
  const atrArr = atr(bars, 14);
  const atrNow = atrArr[atrArr.length - 1] || (last.high - last.low) || price * 0.01;
  const cl = closes(bars);
  const ema50 = ema(cl, 50);
  const ema200 = ema(cl, 200);
  const rsiArr = rsi(cl, 14);
  const rsiNow = rsiArr[rsiArr.length - 1];

  const direction = A.bias === 'bull' ? 'long' : A.bias === 'bear' ? 'short' : 'none';
  const isLong = direction === 'long';

  /* -------------------------------------------------- */
  /* مناطق مرشّحة للدخول                                  */
  /* -------------------------------------------------- */

  const wantDir = isLong ? 'bull' : 'bear';

  // الفجوات غير المردومة في اتجاه الصفقة والقريبة من السعر
  const fvgCandidates = A.openFVGs
    .filter((f) => f.dir === wantDir)
    .filter((f) => (isLong ? f.top <= price * 1.01 : f.bottom >= price * 0.99))
    .sort((a, b) => (isLong ? b.top - a.top : a.bottom - b.bottom));

  const nearestFVG = fvgCandidates[0] || null;
  const oteZone = A.impulse ? { top: A.impulse.ote.top, bottom: A.impulse.ote.bottom } : null;
  const obZone =
    A.orderBlock && A.orderBlock.dir === wantDir
      ? { top: A.orderBlock.top, bottom: A.orderBlock.bottom }
      : null;

  // المنطقة المثالية = تقاطع OTE مع فجوة/أوردر بلوك، وإلا فـ OTE وحدها
  let ideal =
    overlap(oteZone, nearestFVG ? { top: nearestFVG.top, bottom: nearestFVG.bottom } : null) ||
    overlap(oteZone, obZone) ||
    oteZone ||
    (nearestFVG ? { top: nearestFVG.top, bottom: nearestFVG.bottom } : null);

  let idealSource = 'منطقة الدخول المثالية (OTE)';
  if (ideal && oteZone && nearestFVG && overlap(oteZone, { top: nearestFVG.top, bottom: nearestFVG.bottom }))
    idealSource = 'تقاطع OTE مع فجوة قيمة عادلة';
  else if (ideal && oteZone && obZone && overlap(oteZone, obZone))
    idealSource = 'تقاطع OTE مع منطقة أوامر';
  else if (ideal && !oteZone) idealSource = 'فجوة قيمة عادلة غير مردومة';

  /* -------------------------------------------------- */
  /* مستويات الدخول الثلاثة                               */
  /* -------------------------------------------------- */

  // مبكر: أول مستوى يلمسه السعر وهو مرتدّ نحو منطقة الدخول.
  // لا بد أن يكون أمام السعر في اتجاه الارتداد، وإلا فلا معنى له.
  const earlyCandidates = [
    A.impulse ? A.impulse.levels.r382 : null,
    A.impulse ? A.impulse.levels.r5 : null,
    nearestFVG ? (isLong ? nearestFVG.top : nearestFVG.bottom) : null,
    ideal ? (isLong ? ideal.top : ideal.bottom) : null,
  ].filter((v) => v != null && isFinite(v));

  // للشراء الارتداد لأسفل (نريد أعلى مستوى تحت السعر)،
  // وللبيع الارتداد لأعلى (نريد أدنى مستوى فوق السعر).
  const ahead = earlyCandidates.filter((v) => (isLong ? v < price : v > price));
  let early = ahead.length ? (isLong ? Math.max(...ahead) : Math.min(...ahead)) : null;

  // مؤكد: كسر آخر مستوى بنيوي في اتجاه الصفقة
  const relevantPivots = isLong ? A.swings.highs : A.swings.lows;
  const pivotAhead = [...relevantPivots]
    .reverse()
    .find((p) => (isLong ? p.price > price : p.price < price));
  const lastBreakLevel = A.lastEvent ? A.lastEvent.level : null;
  let confirmed = pivotAhead ? pivotAhead.price : lastBreakLevel;
  if (confirmed != null) confirmed = isLong ? confirmed + atrNow * 0.05 : confirmed - atrNow * 0.05;

  /* -------------------------------------------------- */
  /* الوقف والأهداف                                       */
  /* -------------------------------------------------- */

  let structuralStop = null;
  if (A.impulse) structuralStop = isLong ? A.impulse.low.price : A.impulse.high.price;
  if (ideal) {
    structuralStop = isLong
      ? Math.min(structuralStop ?? Infinity, ideal.bottom)
      : Math.max(structuralStop ?? -Infinity, ideal.top);
  }
  const stop =
    structuralStop == null
      ? isLong
        ? price - atrNow * 2
        : price + atrNow * 2
      : isLong
      ? structuralStop - atrNow * 0.35
      : structuralStop + atrNow * 0.35;

  // الأهداف: السيولة المقابلة ثم امتدادات الفيبوناتشي
  const targets = [];
  const liqSide = isLong ? 'buyside' : 'sellside';
  A.liquidity
    .filter((l) => l.type === liqSide)
    .filter((l) => (isLong ? l.price > price : l.price < price))
    .sort((a, b) => (isLong ? a.price - b.price : b.price - a.price))
    .slice(0, 2)
    .forEach((l, i) =>
      targets.push({ price: l.price, label: `تجمّع أوامر ${i + 1}`, note: `${l.touches} لمسات` })
    );

  const oppositePivot = (isLong ? A.swings.highs : A.swings.lows)
    .filter((p) => (isLong ? p.price > price : p.price < price))
    .sort((a, b) => (isLong ? a.price - b.price : b.price - a.price))[0];
  if (oppositePivot) targets.push({ price: oppositePivot.price, label: 'قمة/قاع سابق' });

  if (A.impulse) {
    const e = isLong ? A.impulse.ext.e1272 : A.impulse.ext.e1272;
    if ((isLong && e > price) || (!isLong && e < price)) targets.push({ price: e, label: 'امتداد 1.272' });
  }

  // الهدف يجب أن يقع خلف منطقة الدخول لا داخلها: هدف بين حدّي المنطقة
  // يعني صفقة بلا حركة، وهو ما كان يحدث حين يُرشَّح قاع قريب جدًا.
  const beyondEntry = (p) => {
    if (!ideal) return true;
    return isLong ? p > ideal.top : p < ideal.bottom;
  };

  // ترتيب وإزالة المكرر
  const seen = new Set();
  const picked = targets
    .filter((t) => t.price != null && isFinite(t.price))
    .filter((t) => beyondEntry(t.price))
    .sort((a, b) => (isLong ? a.price - b.price : b.price - a.price))
    .filter((t) => {
      const k = roundPrice(t.price);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3);

  // الهدف منطقة لا نقطة: السعر نادرًا ما يقف عند رقم بعينه، والخروج
  // على مدى أقرب للواقع من انتظار سعر محدد. نأخذ المدى من منطقة التقاء
  // تحتضن الهدف إن وُجدت، وإلا فهامش من المدى الحقيقي.
  // لو لم ينجُ أي هدف فالامتداد هو البديل الطبيعي، وإلا فلا صفقة
  if (!picked.length && A.impulse) {
    const ext = A.impulse.ext.e1272;
    if (beyondEntry(ext)) picked.push({ price: ext, label: 'امتداد 1.272' });
  }

  const confFar = conf ? (isLong ? conf.resistances : conf.supports) : [];
  const finalTargets = picked.map((t) => {
    const zone = confFar.find((z) => t.price >= z.low && t.price <= z.high);
    const pad = atrNow * 0.3;
    const low = zone ? zone.low : t.price - pad;
    const high = zone ? zone.high : t.price + pad;
    return {
      ...t,
      price: t.price,
      low: Math.min(low, high),
      high: Math.max(low, high),
      fromZone: !!zone,
      zoneStrength: zone ? zone.strength : null,
    };
  });

  /* -------------------------------------------------- */
  /* نسب المخاطرة/العائد                                  */
  /* -------------------------------------------------- */

  const rrFor = (entry) => {
    if (entry == null || !finalTargets.length) return null;
    const risk = Math.abs(entry - stop);
    if (!risk) return null;
    const reward = Math.abs(finalTargets[finalTargets.length - 1].price - entry);
    return +(reward / risk).toFixed(2);
  };

  const idealMid = ideal ? (ideal.top + ideal.bottom) / 2 : null;

  /* -------------------------------------------------- */
  /* قائمة التحقق ودرجة الثقة                             */
  /* -------------------------------------------------- */

  const htfBias = (tf) => (htf[tf] && htf[tf].ok ? htf[tf].bias : null);
  const dBias = htfBias('1d');
  const wBias = htfBias('1wk');

  const checklist = [];
  const add = (ok, text, weight) => checklist.push({ ok, text, weight });

  add(A.bias !== 'neutral', `بنية الفريم الحالي ${labelBias(A.bias)}`, 18);
  add(!!A.lastMSS, 'يوجد تغيّر بنية (MSS) حديث', 14);
  add(!!nearestFVG, 'فجوة قيمة عادلة غير مردومة في اتجاه الصفقة', 14);
  add(
    !!(A.impulse && ((isLong && A.zone === 'discount') || (!isLong && A.zone === 'premium'))),
    isLong ? 'السعر في المنطقة المخفّضة تحت التوازن' : 'السعر في المنطقة المرتفعة فوق التوازن',
    14
  );
  add(dBias == null || dBias === A.bias, 'توافق مع الإطار اليومي', 12);
  add(wBias == null || wBias === A.bias, 'توافق مع الإطار الأسبوعي', 10);
  add(!!obZone, 'منطقة أوامر مؤيّدة', 8);
  const emaOk =
    ema50[ema50.length - 1] != null &&
    (isLong ? price > ema50[ema50.length - 1] : price < ema50[ema50.length - 1]);
  add(emaOk, 'السعر في الجانب الصحيح من متوسط 50', 10);
  const rsiOk = rsiNow == null ? false : isLong ? rsiNow > 45 && rsiNow < 78 : rsiNow < 55 && rsiNow > 22;
  add(rsiOk, 'مؤشر القوة النسبية داعم وليس متشبّعًا', 10);
  const rrOk = (rrFor(idealMid) || 0) >= 2;
  add(rrOk, 'نسبة عائد/مخاطرة 2 أو أكثر من المنطقة المثالية', 14);

  // نقطة الالتقاء: هل تسند منطقة الدخول أسباب مستقلة متعددة؟
  const confSide = conf ? (isLong ? conf.supports : conf.resistances) : [];
  const confAtEntry = ideal ? confSide.find((z) => zonesOverlap(z, ideal)) : null;
  const bestConf = confSide[0] || null;
  add(
    !!(confAtEntry && confAtEntry.reliable),
    confAtEntry
      ? `منطقة الدخول عليها نقطة التقاء بقوة ${confAtEntry.strength} (${confAtEntry.catCount} عوامل)`
      : 'منطقة الدخول مدعومة بنقطة التقاء قوية',
    16
  );

  const totalWeight = checklist.reduce((s, c) => s + c.weight, 0);
  const gained = checklist.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0);
  const confidence = direction === 'none' ? 0 : Math.round(clamp((gained / totalWeight) * 100, 0, 100));

  const grade =
    confidence >= 75 ? 'قوية' : confidence >= 55 ? 'جيدة' : confidence >= 40 ? 'متوسطة' : 'ضعيفة';

  /* -------------------------------------------------- */
  /* الملخّص النصي                                        */
  /* -------------------------------------------------- */

  let summary;
  if (direction === 'none') {
    summary = 'البنية غير واضحة حاليًا — الأفضل الانتظار حتى يتكوّن كسر بنية واضح.';
  } else {
    const d = isLong ? 'شرائية' : 'بيعية';
    const z = A.zone === 'discount' ? 'منطقة مخفّضة' : A.zone === 'premium' ? 'منطقة مرتفعة' : 'منطقة محايدة';
    const zoneFits = (isLong && A.zone === 'discount') || (!isLong && A.zone === 'premium');
    const caution = zoneFits
      ? ''
      : ` (لم يصل السعر بعد إلى منطقة ال${sideWordOf(isLong)} — الانتظار أفضل من المطاردة)`;
    summary =
      `النظرة ${d} على هذا الإطار. السعر في ${z}${caution}` +
      (ideal ? `، وأفضل منطقة دخول بين ${roundPrice(ideal.bottom)} و ${roundPrice(ideal.top)} (${idealSource})` : '') +
      `. الوقف ${isLong ? 'تحت' : 'فوق'} ${roundPrice(stop)}` +
      (finalTargets.length ? `، والهدف الأبعد ${roundPrice(finalTargets[finalTargets.length - 1].price)}.` : '.') +
      (confAtEntry && confAtEntry.reliable
        ? ` وتزكية إضافية: منطقة الدخول نفسها نقطة التقاء بقوة ${confAtEntry.strength} يجتمع عندها ${confAtEntry.catCount} عوامل` +
          (confAtEntry.proven
            ? ` (ارتدّ منها السعر ${confAtEntry.reaction.bounces} من ${confAtEntry.reaction.touches} اقترابات سابقة).`
            : ' (لم تُختبر كثيرًا بعد).')
        : bestConf && bestConf.reliable
        ? ` أقوى نقطة التقاء قريبة عند ${roundPrice(bestConf.low)} – ${roundPrice(bestConf.high)} بقوة ${bestConf.strength}.`
        : '') +
      ` جودة الفرصة: ${grade} (${confidence}%).`;
  }

  const sideWord = isLong ? 'شراء' : 'بيع';

  return {
    ok: true,
    direction,
    sideWord,
    bias: A.bias,
    price,
    atr: atrNow,
    zone: A.zone,
    idealSource,
    entries: {
      early: early != null ? roundPrice(early) : null,
      ideal: ideal ? { bottom: roundPrice(ideal.bottom), top: roundPrice(ideal.top) } : null,
      confirmed: confirmed != null ? roundPrice(confirmed) : null,
    },
    equilibrium: A.impulse ? roundPrice(A.impulse.equilibrium) : null,
    stop: roundPrice(stop),
    targets: finalTargets.map((t) => ({
      ...t,
      price: roundPrice(t.price),
      low: roundPrice(t.low),
      high: roundPrice(t.high),
      // بُعد الهدف عن السعر: بالنسبة المئوية وبعدد جلسات الحركة المعتادة
      distancePct: ((t.price - price) / price) * 100,
      sessions: atrNow ? Math.abs(t.price - price) / atrNow : null,
    })),
    // بُعد منطقة الدخول — يجيب سؤال «هل الصفقة قريبة؟»
    entryDistance: ideal
      ? {
          pct: ((idealMid - price) / price) * 100,
          sessions: atrNow ? Math.abs(idealMid - price) / atrNow : null,
          inside: price <= Math.max(ideal.top, ideal.bottom) && price >= Math.min(ideal.top, ideal.bottom),
        }
      : null,
    rr: {
      early: rrFor(early),
      ideal: rrFor(idealMid),
      confirmed: rrFor(confirmed),
    },
    confidence,
    grade,
    checklist,
    summary,
    confluence: { atEntry: confAtEntry, best: bestConf },
    rsi: rsiNow != null ? +rsiNow.toFixed(1) : null,
    ema50: ema50[ema50.length - 1] != null ? roundPrice(ema50[ema50.length - 1]) : null,
    ema200: ema200[ema200.length - 1] != null ? roundPrice(ema200[ema200.length - 1]) : null,
    htf: { daily: dBias, weekly: wBias },
  };
}

function sideWordOf(isLong) {
  return isLong ? 'شراء' : 'بيع';
}

export function labelBias(b) {
  return b === 'bull' ? 'صاعدة' : b === 'bear' ? 'هابطة' : 'محايدة';
}
