/* اختبارات فجوات القيمة العادلة ومناطق الأوامر وبنية السوق */

import { suite, test, assert, equal, close, bar, rng } from './harness.mjs';
import { findFVGs, findSwings, marketStructure, orderBlockFor, analyze } from '../www/js/ict.js';

/* ------------------------------------------------------------------ */
/* فجوات القيمة العادلة                                                 */
/* ------------------------------------------------------------------ */

suite('فجوات القيمة العادلة FVG', () => {
  test('ترصد فجوة صاعدة: قمة الشمعة الأولى تحت قاع الثالثة', () => {
    const bars = [
      bar(1, 100, 102, 99, 101), // قمتها 102
      bar(2, 101, 112, 101, 111), // شمعة الاندفاع
      bar(3, 111, 115, 108, 114), // قاعها 108 > 102 ← فجوة بين 102 و 108
      // قاع هذه الشمعة (111) تحت قمة الشمعة الثانية (112) حتى لا تتكوّن فجوة أخرى
      bar(4, 114, 116, 111, 115),
    ];
    const gaps = findFVGs(bars);
    equal(gaps.length, 1, 'عدد الفجوات');
    equal(gaps[0].dir, 'bull', 'الاتجاه');
    close(gaps[0].bottom, 102, 1e-9, 'حد الفجوة الأدنى');
    close(gaps[0].top, 108, 1e-9, 'حد الفجوة الأعلى');
    equal(gaps[0].index, 1, 'موضع الشمعة الوسطى');
  });

  test('ترصد فجوة هابطة: قاع الشمعة الأولى فوق قمة الثالثة', () => {
    const bars = [
      bar(1, 115, 116, 112, 113), // قاعها 112
      bar(2, 113, 113, 102, 103),
      bar(3, 103, 106, 100, 101), // قمتها 106 < 112 ← فجوة بين 106 و 112
      bar(4, 101, 102, 99, 100),
    ];
    const gaps = findFVGs(bars);
    equal(gaps.length, 1, 'عدد الفجوات');
    equal(gaps[0].dir, 'bear', 'الاتجاه');
    close(gaps[0].bottom, 106, 1e-9, 'حد الفجوة الأدنى');
    close(gaps[0].top, 112, 1e-9, 'حد الفجوة الأعلى');
  });

  test('لا ترصد فجوة حين تتداخل الشمعتان الأولى والثالثة', () => {
    const bars = [
      bar(1, 100, 110, 99, 109),
      bar(2, 109, 115, 108, 114),
      bar(3, 114, 118, 105, 117), // قاعها 105 < 110 ← تداخل، لا فجوة
      // قاعها (114) تحت قمة الشمعة الثانية (115) حتى لا تتكوّن فجوة في آخر ثلاث شمعات
      bar(4, 117, 119, 114, 118),
    ];
    equal(findFVGs(bars).length, 0, 'يجب ألا تُرصد فجوة');
  });

  test('تتجاهل الفجوات الأصغر من الحد الأدنى', () => {
    // فجوة مقدارها 0.01 على سعر 100 ← 0.01٪ وهي تحت الحد الافتراضي 0.05٪
    const bars = [
      bar(1, 100, 100.0, 99, 99.5),
      bar(2, 99.5, 100.5, 99.5, 100.2),
      bar(3, 100.2, 101, 100.01, 100.8),
      bar(4, 100.8, 101, 100.5, 100.9),
    ];
    equal(findFVGs(bars).length, 0, 'فجوة ضئيلة يجب تجاهلها');
    const loose = findFVGs(bars, { minSizePct: 0 });
    equal(loose.length, 1, 'تظهر عند إلغاء الحد الأدنى');
  });

  test('تُعلَّم الفجوة كمردومة حين يعود السعر ويغطيها بالكامل', () => {
    const bars = [
      bar(1, 100, 102, 99, 101),
      bar(2, 101, 112, 101, 111),
      bar(3, 111, 115, 108, 114), // فجوة 102 → 108
      bar(4, 114, 116, 110, 112),
      bar(5, 112, 113, 101, 102), // قاعها 101 ≤ 102 ← ردم كامل
    ];
    const gaps = findFVGs(bars);
    equal(gaps.length, 1, 'عدد الفجوات');
    equal(gaps[0].mitigated, true, 'يجب أن تكون مردومة');
    equal(gaps[0].endTime, 5, 'وقت الردم');
  });

  test('الفجوة التي لم تُلمس تبقى غير مردومة ونسبة ردمها صفر', () => {
    const bars = [
      bar(1, 100, 102, 99, 101),
      bar(2, 101, 112, 101, 111),
      bar(3, 111, 115, 108, 114), // فجوة 102 → 108
      bar(4, 114, 118, 112, 117),
      bar(5, 117, 120, 115, 119),
    ];
    const g = findFVGs(bars)[0];
    equal(g.mitigated, false, 'غير مردومة');
    close(g.filled, 0, 1e-9, 'نسبة الردم');
  });

  test('الردم الجزئي يُحسب كنسبة صحيحة', () => {
    const bars = [
      bar(1, 100, 102, 99, 101),
      bar(2, 101, 112, 101, 111),
      bar(3, 111, 115, 108, 114), // فجوة 102 → 108 ، حجمها 6
      bar(4, 114, 116, 105, 110), // نزل إلى 105 ← غطّى 3 من 6 = 50٪
      bar(5, 110, 113, 109, 112),
    ];
    const g = findFVGs(bars)[0];
    equal(g.mitigated, false, 'لم تُردم بالكامل');
    close(g.filled, 0.5, 1e-9, 'نسبة الردم');
  });

  test('openFVGs في التحليل الكامل تستبعد المردومة', () => {
    const r = rng(5);
    const bars = [];
    let p = 100;
    for (let i = 0; i < 120; i++) {
      const o = p;
      p = p * (1 + (r() - 0.45) * 0.03);
      bars.push(bar(1700000000 + i * 86400, o, Math.max(o, p) * 1.01, Math.min(o, p) * 0.99, p));
    }
    const A = analyze(bars);
    assert(A.ok, 'التحليل نجح');
    assert(
      A.openFVGs.every((f) => !f.mitigated),
      'كل الفجوات المفتوحة يجب أن تكون غير مردومة'
    );
    assert(A.openFVGs.length <= A.fvgs.length, 'المفتوحة جزء من الكل');
  });
});

/* ------------------------------------------------------------------ */
/* القمم والقيعان وبنية السوق                                          */
/* ------------------------------------------------------------------ */

suite('القمم والقيعان', () => {
  test('ترصد القمة المحلية والقاع المحلي بصورة صحيحة', () => {
    const closes = [10, 11, 15, 11, 10, 9, 5, 9, 10, 11, 12];
    const bars = closes.map((c, i) => bar(i, c, c + 0.5, c - 0.5, c));
    const s = findSwings(bars, 2);
    const highIdx = s.highs.map((h) => h.index);
    const lowIdx = s.lows.map((l) => l.index);
    assert(highIdx.includes(2), `القمة عند 2 مفقودة (${highIdx})`);
    assert(lowIdx.includes(6), `القاع عند 6 مفقود (${lowIdx})`);
  });

  test('لا تُرصد قمم في أول وآخر lookback شمعة', () => {
    const closes = [20, 10, 10, 10, 10, 10, 20];
    const bars = closes.map((c, i) => bar(i, c, c + 0.5, c - 0.5, c));
    const s = findSwings(bars, 2);
    assert(
      s.highs.every((h) => h.index >= 2 && h.index <= bars.length - 3),
      'قمة خارج النطاق الصالح'
    );
  });
});

suite('بنية السوق BOS / MSS', () => {
  test('كسر قمة بعد ترند هابط يُسجَّل كتغيّر بنية MSS', () => {
    // هبوط يصنع قاعًا ثم قمة، ثم كسر صاعد فوق تلك القمة
    const closes = [
      100, 98, 96, 94, 92, 90, 88, 86, // هبوط
      84, 86, 88, 86, 84, // قاع ثم ارتداد يصنع قمة محلية عند 88
      82, 80, // استمرار الهبوط لتثبيت الاتجاه الهابط
      84, 88, 94, // اختراق صاعد فوق القمة السابقة
      96, 98,
    ];
    const bars = closes.map((c, i) => bar(i, c, c + 0.4, c - 0.4, c));
    const { events } = marketStructure(bars, 2);
    const bull = events.filter((e) => e.dir === 'bull');
    assert(bull.length > 0, 'لم يُسجَّل أي كسر صاعد');
    assert(
      events.some((e) => e.kind === 'MSS' && e.dir === 'bull'),
      `لم يُسجَّل MSS صاعد. الأحداث: ${events.map((e) => e.kind + '/' + e.dir).join(', ')}`
    );
  });

  test('كل حدث يحمل مستوى الكسر وموضع الشمعة التي كسرته', () => {
    const r = rng(21);
    const closes = [];
    let p = 100;
    for (let i = 0; i < 160; i++) {
      p += (r() - 0.5) * 4;
      closes.push(p);
    }
    const bars = closes.map((c, i) => bar(i, c, c + 0.5, c - 0.5, c));
    const { events } = marketStructure(bars, 2);
    assert(events.length > 0, 'لا توجد أحداث');
    events.forEach((e) => {
      assert(isFinite(e.level), 'مستوى غير رقمي');
      assert(e.breakIndex > e.pivotIndex, 'الكسر يجب أن يأتي بعد القمة/القاع');
      assert(['MSS', 'BOS'].includes(e.kind), 'نوع غير معروف');
      if (e.dir === 'bull') {
        assert(bars[e.breakIndex].close > e.level, 'الكسر الصاعد يجب أن يغلق فوق المستوى');
      } else {
        assert(bars[e.breakIndex].close < e.level, 'الكسر الهابط يجب أن يغلق تحت المستوى');
      }
    });
  });
});

/* ------------------------------------------------------------------ */
/* مناطق الأوامر                                                        */
/* ------------------------------------------------------------------ */

suite('مناطق الأوامر Order Block', () => {
  test('الكسر الصاعد يختار آخر شمعة هابطة قبله', () => {
    const bars = [
      bar(0, 100, 101, 99, 100.5), // صاعدة
      bar(1, 100.5, 101, 96, 97), // هابطة ← المرشّحة
      bar(2, 97, 104, 97, 103), // اندفاع صاعد
      bar(3, 103, 108, 102, 107), // شمعة الكسر (صاعدة)
    ];
    const ob = orderBlockFor(bars, { dir: 'bull', breakIndex: 3 });
    assert(ob, 'لم تُرجَع منطقة أوامر');
    equal(ob.index, 1, 'موضع شمعة منطقة الأوامر');
    equal(ob.dir, 'bull', 'اتجاه المنطقة');
    close(ob.top, 101, 1e-9, 'الحد الأعلى = قمة الشمعة');
    close(ob.bottom, 96, 1e-9, 'الحد الأدنى = قاع الشمعة');
  });

  test('الكسر الهابط يختار آخر شمعة صاعدة قبله', () => {
    const bars = [
      bar(0, 100, 101, 99, 98), // هابطة
      bar(1, 98, 106, 97, 105), // صاعدة ← المرشّحة
      bar(2, 105, 105, 99, 100), // اندفاع هابط
      bar(3, 100, 101, 94, 95), // شمعة الكسر (هابطة)
    ];
    const ob = orderBlockFor(bars, { dir: 'bear', breakIndex: 3 });
    assert(ob, 'لم تُرجَع منطقة أوامر');
    equal(ob.index, 1, 'موضع شمعة منطقة الأوامر');
    close(ob.top, 106, 1e-9, 'الحد الأعلى');
    close(ob.bottom, 97, 1e-9, 'الحد الأدنى');
  });

  test('تعود بلا نتيجة حين لا توجد شمعة معاكسة في النطاق', () => {
    // كل الشموع صاعدة، فلا توجد شمعة هابطة لكسر صاعد
    const bars = Array.from({ length: 10 }, (_, i) => bar(i, 100 + i, 101 + i, 99 + i, 100.8 + i));
    const ob = orderBlockFor(bars, { dir: 'bull', breakIndex: 9 });
    equal(ob, null, 'يجب ألا تُرجَع منطقة');
  });

  test('الحدود دائمًا منطقية: الأعلى فوق الأدنى', () => {
    const r = rng(13);
    const bars = [];
    let p = 50;
    for (let i = 0; i < 80; i++) {
      const o = p;
      p += (r() - 0.5) * 3;
      bars.push(bar(i, o, Math.max(o, p) + 0.6, Math.min(o, p) - 0.6, p));
    }
    for (const dir of ['bull', 'bear']) {
      for (let bi = 40; bi < 80; bi += 7) {
        const ob = orderBlockFor(bars, { dir, breakIndex: bi });
        if (ob) assert(ob.top > ob.bottom, `حدود مقلوبة عند ${bi}`);
      }
    }
  });
});
