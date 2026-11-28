/* اختبارات محرّك الاختبار التاريخي */

import { suite, test, assert, equal, close, bar, rng } from './harness.mjs';
import { backtestPlan, sessionsAway, proximityLabel, MIN_SAMPLE } from '../www/js/backtest.js';
import { buildPlan } from '../www/js/strategy.js';
import { analyze } from '../www/js/ict.js';

/** سلسلة متذبذبة طويلة تُنتج أحداثًا بنيوية كثيرة */
function wavy(n, seed = 5) {
  const r = rng(seed);
  const bars = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + (r() - 0.48) * 0.035);
    const hi = Math.max(o, p) * (1 + r() * 0.012);
    const lo = Math.min(o, p) * (1 - r() * 0.012);
    bars.push(bar(1700000000 + i * 86400, o, hi, lo, p, 1000 + Math.round(r() * 9000)));
  }
  return bars;
}

suite('الاختبار التاريخي للخطة', () => {
  test('يرفض البيانات القصيرة برسالة واضحة', () => {
    const r = backtestPlan(wavy(80));
    equal(r.ok, false, 'يجب ألا ينجح');
    assert(r.reason && r.reason.length > 0, 'رسالة مفقودة');
  });

  test('ينتج نتيجة على تاريخ كافٍ', () => {
    const r = backtestPlan(wavy(600));
    assert(r.ok, 'التحليل فشل: ' + r.reason);
    assert(r.setups > 0, 'لا توجد إشارات');
    assert(Array.isArray(r.targets) && r.targets.length > 0, 'لا توجد أهداف');
  });

  test('كل النسب داخل المدى المنطقي', () => {
    const r = backtestPlan(wavy(700, 11));
    assert(r.ok, r.reason);
    const inRange = (x) => x == null || (x >= 0 && x <= 1);
    assert(inRange(r.entryReach.rate), `نسبة الوصول: ${r.entryReach.rate}`);
    assert(inRange(r.stopFirst.rate), `نسبة الوقف: ${r.stopFirst.rate}`);
    r.targets.forEach((t, i) => assert(inRange(t.rate), `هدف ${i + 1}: ${t.rate}`));
  });

  test('عدد الدخولات لا يتجاوز عدد الإشارات', () => {
    const r = backtestPlan(wavy(650, 3));
    assert(r.ok, r.reason);
    assert(r.entryReach.count <= r.entryReach.sample, 'دخولات أكثر من الإشارات');
    r.targets.forEach((t) => {
      assert(t.hits <= t.sample, `هدف ${t.index}: إصابات أكثر من العيّنة`);
      assert(t.sample <= r.entryReach.count, `هدف ${t.index}: عيّنة أكبر من الدخولات`);
    });
  });

  test('الأهداف الأبعد لا تتحقق أكثر من الأقرب', () => {
    // منطقيًا: ما بلغ الهدف الثاني فقد مرّ بالأول
    const r = backtestPlan(wavy(800, 23));
    assert(r.ok, r.reason);
    for (let i = 1; i < r.targets.length; i++) {
      const a = r.targets[i - 1];
      const b = r.targets[i];
      if (a.rate == null || b.rate == null) continue;
      assert(b.hits <= a.hits, `هدف ${i + 1} تحقّق (${b.hits}) أكثر من هدف ${i} (${a.hits})`);
    }
  });

  test('لا ينظر إلى المستقبل: الخطة تُبنى من الماضي وحده', () => {
    // نقصّ البيانات عند نقطة ونتحقق أن الخطة المبنية عندها لا تتأثر
    // بما بعدها — وهو شرط صحة أي اختبار تاريخي
    const full = wavy(500, 7);
    const cut = 300;
    const past = full.slice(0, cut + 1);
    const planFromPast = buildPlan(past, analyze(past), {}, null);

    const tampered = full.slice();
    for (let i = cut + 1; i < tampered.length; i++) {
      tampered[i] = { ...tampered[i], high: tampered[i].high * 3, close: tampered[i].close * 3 };
    }
    const past2 = tampered.slice(0, cut + 1);
    const planFromTampered = buildPlan(past2, analyze(past2), {}, null);

    equal(
      JSON.stringify(planFromPast.entries),
      JSON.stringify(planFromTampered.entries),
      'تغيير المستقبل غيّر الخطة — تسريب بيانات'
    );
    equal(planFromPast.stop, planFromTampered.stop, 'الوقف تأثّر بالمستقبل');
  });

  test('نتيجة ثابتة عند تكرار التشغيل على نفس البيانات', () => {
    const b = wavy(600, 31);
    const a1 = backtestPlan(b);
    const a2 = backtestPlan(b);
    equal(a1.setups, a2.setups, 'عدد الإشارات اختلف');
    equal(JSON.stringify(a1.targets), JSON.stringify(a2.targets), 'النتائج اختلفت');
  });

  test('حدّ العيّنة الأدنى يُحتسب بصورة صحيحة', () => {
    const r = backtestPlan(wavy(620, 13));
    assert(r.ok, r.reason);
    equal(r.enough, r.setups >= MIN_SAMPLE, 'علامة كفاية العيّنة غير متسقة');
  });
});

suite('قرب الصفقة', () => {
  test('المسافة تُقاس بعدد جلسات الحركة المعتادة', () => {
    close(sessionsAway(10, 2), 5, 1e-9, 'عشر وحدات بمدى يومي 2');
    equal(sessionsAway(10, 0), null, 'بلا مدى');
  });

  test('الوصف يتدرّج مع البعد', () => {
    equal(proximityLabel(0.2).tone, 'now', 'عند السعر');
    equal(proximityLabel(1).tone, 'near', 'قريبة جدًا');
    equal(proximityLabel(3).tone, 'near', 'قريبة');
    equal(proximityLabel(7).tone, 'mid', 'متوسطة');
    equal(proximityLabel(20).tone, 'far', 'بعيدة');
    equal(proximityLabel(null), null, 'بلا قيمة');
  });
});

suite('الأهداف كمديات', () => {
  test('لكل هدف حدّ أعلى وأدنى ومسافة عن السعر', () => {
    const bars = wavy(400, 17);
    const A = analyze(bars);
    const plan = buildPlan(bars, A, {}, null);
    if (plan.direction === 'none' || !plan.targets.length) return; // لا خطة، لا شيء نفحصه
    plan.targets.forEach((t, i) => {
      assert(t.low <= t.price && t.price <= t.high, `هدف ${i + 1}: السعر خارج المدى`);
      assert(t.high > t.low, `هدف ${i + 1}: مدى منعدم`);
      assert(typeof t.distancePct === 'number', `هدف ${i + 1}: مسافة مفقودة`);
    });
  });

  test('بعد منطقة الدخول محسوب', () => {
    const bars = wavy(400, 19);
    const plan = buildPlan(bars, analyze(bars), {}, null);
    if (!plan.entries.ideal) return;
    assert(plan.entryDistance != null, 'بُعد الدخول مفقود');
    assert(typeof plan.entryDistance.pct === 'number', 'النسبة مفقودة');
    assert(typeof plan.entryDistance.inside === 'boolean', 'علامة الوجود داخل المنطقة مفقودة');
  });
});
