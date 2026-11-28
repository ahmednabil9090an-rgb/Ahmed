/* قوائم الأدوات المتاحة — مصنّفة بأسماء عربية */

export const MARKETS = [
  {
    id: 'egx',
    label: 'البورصة المصرية',
    items: [
      { symbol: 'COMI.CA', ar: 'البنك التجاري الدولي', en: 'CIB' },
      { symbol: 'TMGH.CA', ar: 'طلعت مصطفى القابضة', en: 'TMG Holding' },
      { symbol: 'EAST.CA', ar: 'الشرقية — ايسترن كومباني', en: 'Eastern Co.' },
      { symbol: 'SWDY.CA', ar: 'السويدي إليكتريك', en: 'El Sewedy Electric' },
      { symbol: 'ABUK.CA', ar: 'أبو قير للأسمدة', en: 'Abu Qir Fertilizers' },
      { symbol: 'MFPC.CA', ar: 'موبكو للأسمدة', en: 'MOPCO' },
      { symbol: 'ETEL.CA', ar: 'المصرية للاتصالات', en: 'Telecom Egypt' },
      { symbol: 'HRHO.CA', ar: 'المجموعة المالية هيرميس', en: 'EFG Holding' },
      { symbol: 'FWRY.CA', ar: 'فوري', en: 'Fawry' },
      { symbol: 'EFIH.CA', ar: 'إي فاينانس', en: 'e-finance' },
      { symbol: 'SKPC.CA', ar: 'سيدي كرير للبتروكيماويات', en: 'Sidi Kerir' },
      { symbol: 'AMOC.CA', ar: 'الإسكندرية للزيوت المعدنية', en: 'AMOC' },
      { symbol: 'EGAL.CA', ar: 'مصر للألومنيوم', en: 'Egypt Aluminum' },
      { symbol: 'IRON.CA', ar: 'الحديد والصلب المصرية', en: 'Egyptian Iron & Steel' },
      { symbol: 'ATQA.CA', ar: 'حديد عتاقة', en: 'Misr National Steel' },
      { symbol: 'MASR.CA', ar: 'مدينة مصر للإسكان', en: 'Madinet Masr' },
      { symbol: 'PHDC.CA', ar: 'بالم هيلز', en: 'Palm Hills' },
      { symbol: 'OCDI.CA', ar: 'سوديك', en: 'SODIC' },
      { symbol: 'ORHD.CA', ar: 'أوراسكوم للتنمية', en: 'Orascom Development' },
      { symbol: 'HELI.CA', ar: 'مصر الجديدة للإسكان', en: 'Heliopolis Housing' },
      { symbol: 'ORWE.CA', ar: 'النساجون الشرقيون', en: 'Oriental Weavers' },
      { symbol: 'JUFO.CA', ar: 'جهينة', en: 'Juhayna' },
      { symbol: 'DOMT.CA', ar: 'دومتي', en: 'Domty' },
      { symbol: 'OLFI.CA', ar: 'عبور لاند', en: 'Obour Land' },
      { symbol: 'SUGR.CA', ar: 'الدلتا للسكر', en: 'Delta Sugar' },
      { symbol: 'ISPH.CA', ar: 'ابن سينا فارما', en: 'Ibnsina Pharma' },
      { symbol: 'GBCO.CA', ar: 'جي بي كورب', en: 'GB Corp' },
      { symbol: 'MTIE.CA', ar: 'إم إم جروب', en: 'MM Group' },
      { symbol: 'CIEB.CA', ar: 'كريدي أجريكول مصر', en: 'Credit Agricole Egypt' },
      { symbol: 'ADIB.CA', ar: 'مصرف أبوظبي الإسلامي', en: 'ADIB Egypt' },
      { symbol: 'SAUD.CA', ar: 'بنك البركة', en: 'AlBaraka Bank' },
      { symbol: 'CCAP.CA', ar: 'القلعة للاستشارات', en: 'Qalaa Holdings' },
      { symbol: 'RAYA.CA', ar: 'راية القابضة', en: 'Raya Holding' },
      { symbol: 'KZPC.CA', ar: 'كفر الزيات للمبيدات', en: 'Kafr El Zayat' },
      { symbol: 'PRMH.CA', ar: 'برايم القابضة', en: 'Prime Holding' },
      { symbol: 'ASPI.CA', ar: 'أسباير كابيتال القابضة', en: 'Aspire Capital Holding' },
      { symbol: 'ETRS.CA', ar: 'إيجيترانز', en: 'Egytrans' },
    ],
  },
  {
    id: 'metals',
    label: 'المعادن',
    items: [
      { symbol: 'GC=F', ar: 'الذهب', en: 'Gold' },
      { symbol: 'SI=F', ar: 'الفضة', en: 'Silver' },
      { symbol: 'HG=F', ar: 'النحاس — كومكس', en: 'Copper COMEX' },
      { symbol: 'COPA.L', ar: 'النحاس — بورصة لندن', en: 'WisdomTree Copper (LSE)' },
    ],
  },
];

/**
 * تطبيع النص العربي حتى يتطابق البحث مهما اختلف رسم الهمزة أو التاء المربوطة:
 * «ابو قير» == «أبو قير» ، «السويدى» == «السويدي».
 */
export function normalizeAr(text) {
  return String(text || '')
    .replace(/[ً-ْـ]/g, '') // التشكيل والتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const INDEX = new Map();
MARKETS.forEach((m) =>
  m.items.forEach((it) => INDEX.set(it.symbol.toUpperCase(), { ...it, market: m.id }))
);

export function describe(symbol) {
  return INDEX.get(String(symbol).toUpperCase()) || null;
}

/** الاسم المعروض للرمز (عربي إن وُجد) */
export function displayName(symbol, fallback) {
  const d = describe(symbol);
  return d ? d.ar : fallback || symbol;
}

export const DEFAULT_WATCHLIST = [
  'COMI.CA',
  'TMGH.CA',
  'ABUK.CA',
  'SWDY.CA',
  'EGAL.CA',
  'GC=F',
  'SI=F',
  'HG=F',
];

/** الأدوات المسموح بها في البحث: البورصة المصرية + الذهب والفضة والنحاس */
export function isAllowed(symbol) {
  const s = String(symbol).toUpperCase();
  return s.endsWith('.CA') || ['GC=F', 'SI=F', 'HG=F', 'COPA.L'].includes(s);
}
