/* اختبارات ملف الأحجام حسب السعر (Volume Profile) */

import { suite, test, assert, equal, close, bar, rng } from './harness.mjs';
import { volumeNodes } from '../www/js/confluence.js';

suite('ملف الأحجام حسب السعر', () => {
  test('أعلى كثافة تقع عند السعر الذي تركّز عنده التداول', () => {
    // 60 شمعة ضيقة حول 100 بأحجام ضخمة، و20 شمعة متفرقة بعيدًا بأحجام صغيرة
    const bars = [];
    for (let i = 0; i < 60; i++) bars.push(bar(i, 100, 100.4, 99.6, 100, 10000));
    for (let i = 0; i < 20; i++) bars.push(bar(60 + i, 130, 131, 129, 130, 50));

    const nodes = volumeNodes(bars, { lookback: 200, bins: 48, topN: 3 });
    assert(nodes.length > 0, 'لم تُرجَع أي عقدة');
    close(nodes[0].price, 100, 1.2, 'أعلى كثافة يجب أن تكون حول 100');
  });

  test('العقد مرتّبة تنازليًا حسب الحجم', () => {
    const r = rng(17);
    const bars = [];
    for (let i = 0; i < 300; i++) {
      const p = 50 + r() * 20;
      bars.push(bar(i, p, p + 0.5, p - 0.5, p, Math.round(r() * 5000)));
    }
    const nodes = volumeNodes(bars, { topN: 5 });
    for (let i = 1; i < nodes.length; i++) {
      assert(nodes[i - 1].volume >= nodes[i].volume, `الترتيب خاطئ عند ${i}`);
    }
  });

  test('كل العقد تقع داخل مدى الأسعار الفعلي', () => {
    const r = rng(23);
    const bars = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 200; i++) {
      const p = 200 + r() * 60;
      const b = bar(i, p, p + 2, p - 2, p, 100 + Math.round(r() * 900));
      lo = Math.min(lo, b.low);
      hi = Math.max(hi, b.high);
      bars.push(b);
    }
    volumeNodes(bars, { topN: 5 }).forEach((n) => {
      assert(n.price >= lo && n.price <= hi, `عقدة خارج المدى: ${n.price} (${lo}–${hi})`);
    });
  });

  test('الحجم الموزّع يساوي إجمالي الحجم المتداول', () => {
    // نتحقق أن التوزيع على الشرائح لا يفقد ولا يضاعف أي حجم
    const bars = [];
    for (let i = 0; i < 50; i++) bars.push(bar(i, 10, 12, 8, 11, 100));
    const nodes = volumeNodes(bars, { lookback: 50, bins: 20, topN: 20 });
    const distributed = nodes.reduce((s, n) => s + n.volume, 0);
    // كل الشموع لها نفس المدى، فالحجم يتوزّع بالتساوي على الشرائح المغطاة
    close(distributed, 50 * 100, 1, 'مجموع الحجم الموزّع');
  });

  test('تتعامل مع الأدوات بلا أحجام دون أن تفشل', () => {
    const bars = Array.from({ length: 60 }, (_, i) => bar(i, 100 + i, 101 + i, 99 + i, 100 + i, 0));
    const nodes = volumeNodes(bars, { topN: 3 });
    assert(Array.isArray(nodes), 'يجب أن تُرجع مصفوفة');
    nodes.forEach((n) => assert(isFinite(n.price), 'سعر غير رقمي'));
  });

  test('تعود فارغة مع بيانات قليلة جدًا', () => {
    equal(volumeNodes([bar(1, 1, 2, 0.5, 1.5, 10)], {}).length, 0, 'شمعة واحدة');
  });

  test('سعر ثابت تمامًا لا يسبب قسمة على صفر', () => {
    const bars = Array.from({ length: 40 }, (_, i) => bar(i, 25, 25, 25, 25, 500));
    const nodes = volumeNodes(bars, { topN: 3 });
    assert(Array.isArray(nodes), 'يجب ألا تنهار');
    nodes.forEach((n) => assert(isFinite(n.price), `سعر غير رقمي: ${n.price}`));
  });

  test('تحترم حدّ النظر للخلف lookback', () => {
    // قديم: تداول ضخم عند 300 ، حديث: تداول ضخم عند 100
    const bars = [];
    for (let i = 0; i < 100; i++) bars.push(bar(i, 300, 301, 299, 300, 100000));
    for (let i = 0; i < 100; i++) bars.push(bar(100 + i, 100, 100.5, 99.5, 100, 100000));
    const recent = volumeNodes(bars, { lookback: 100, bins: 40, topN: 1 });
    close(recent[0].price, 100, 1.5, 'يجب أن ينظر للفترة الأخيرة فقط');
  });
});
