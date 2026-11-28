/* قوائم الأدوات المتاحة — مصنّفة بأسماء عربية.
   أسهم البورصة المصرية مرتّبة تنازليًا حسب متوسط قيمة التداول اليومي،
   وكلها جرى التحقق من توفّر بياناتها لدى المزوّد. */

export const MARKETS = [
  {
    id: 'egx-top',
    label: 'البورصة المصرية — الأكثر سيولة',
    items: [
      { symbol: 'COMI.CA', ar: 'البنك التجاري الدولي', en: 'Commercial International Bank Egypt (CIB)' },
      { symbol: 'CCAP.CA', ar: 'قلعة للاستثمارات المالية', en: 'QALA For Financial Investments' },
      { symbol: 'ETEL.CA', ar: 'المصرية للاتصالات', en: 'Telecom Egypt Company' },
      { symbol: 'AMES.CA', ar: 'المركز الطبي الجديد بالإسكندرية', en: 'Alexandria New Medical Center' },
      { symbol: 'TMGH.CA', ar: 'طلعت مصطفى القابضة', en: 'Talaat Moustafa Group Holding' },
      { symbol: 'BIOC.CA', ar: 'جلاكسو سميثكلاين مصر', en: 'GlaxoSmithKline' },
      { symbol: 'AMOC.CA', ar: 'الإسكندرية للزيوت المعدنية', en: 'Alexandria Mineral Oils Company' },
      { symbol: 'HRHO.CA', ar: 'المجموعة المالية هيرميس', en: 'EFG Holding Company' },
      { symbol: 'PHDC.CA', ar: 'بالم هيلز للتعمير', en: 'Palm Hills Developments' },
      { symbol: 'MPCI.CA', ar: 'ممفيس للأدوية', en: 'Memphis Pharmaceuticals & Chemical Industries' },
      { symbol: 'BTFH.CA', ar: 'بلتون القابضة', en: 'Beltone Holding' },
      { symbol: 'POUL.CA', ar: 'القاهرة للدواجن', en: 'Cairo Poultry Company' },
      { symbol: 'ABUK.CA', ar: 'أبو قير للأسمدة', en: 'Abu Qir Fertilizers & Chemical Industries Company' },
      { symbol: 'FWRY.CA', ar: 'فوري', en: 'Fawry for Banking Technology and Electronic Payments' },
      { symbol: 'GBCO.CA', ar: 'جي بي كورب', en: 'GB Corp' },
      { symbol: 'ORHD.CA', ar: 'أوراسكوم للتنمية مصر', en: 'Orascom Development Egypt' },
      { symbol: 'MFPC.CA', ar: 'موبكو للأسمدة', en: 'Misr Fertilizer Production Company' },
      { symbol: 'EMFD.CA', ar: 'إعمار مصر للتنمية', en: 'Emaar Misr for Development Company' },
      { symbol: 'AMER.CA', ar: 'عامر جروب القابضة', en: 'Amer Group Holding Company' },
      { symbol: 'EGAL.CA', ar: 'مصر للألومنيوم', en: 'Egypt Aluminum' },
      { symbol: 'ACAMD.CA', ar: 'العربية لإدارة الأصول والتنمية', en: 'Arab Co.,for asset management and development' },
      { symbol: 'ARAB.CA', ar: 'المطورون العرب القابضة', en: 'Arab Developers Holding' },
      { symbol: 'ISPH.CA', ar: 'ابن سينا فارما', en: 'Ibnsina Pharma' },
      { symbol: 'PHAR.CA', ar: 'إيبيكو للصناعات الدوائية', en: 'Egyptian International Pharmaceutical Industries Company' },
      { symbol: 'HELI.CA', ar: 'مصر الجديدة للإسكان والتعمير', en: 'Heliopolis Co. for Housing & Development' },
      { symbol: 'EFIH.CA', ar: 'إي فاينانس', en: 'e-finance for Digital and Financial Investments' },
      { symbol: 'MBSC.CA', ar: 'مصر بني سويف للأسمنت', en: 'Misr Beni Suef Cement Co.' },
      { symbol: 'ADIB.CA', ar: 'مصرف أبوظبي الإسلامي مصر', en: 'Abu Dhabi Islamic Bank - Egypt -' },
      { symbol: 'SVCE.CA', ar: 'أسمنت جنوب الوادي', en: 'South Valley Cement Company' },
      { symbol: 'SWDY.CA', ar: 'السويدي إليكتريك', en: 'El Sewedy Electric Company' },
      { symbol: 'SCEM.CA', ar: 'أسمنت سيناء', en: 'Sinai Cement Co.' },
      { symbol: 'EAST.CA', ar: 'الشرقية — ايسترن كومباني', en: 'Eastern Company' },
      { symbol: 'ATQA.CA', ar: 'حديد عتاقة', en: 'Misr National Steel - Ataqa' },
      { symbol: 'MCQE.CA', ar: 'مصر للأسمنت قنا', en: 'Misr Cement (Qena) Company' },
      { symbol: 'CERA.CA', ar: 'العربية للسيراميك', en: 'The Arab Ceramic Co.' },
      { symbol: 'OIH.CA', ar: 'أوراسكوم للاستثمار القابضة', en: 'Orascom Investment Holding' },
      { symbol: 'MTIE.CA', ar: 'إم إم جروب', en: 'MM Group for Industry and International Trade' },
      { symbol: 'EFID.CA', ar: 'إيديتا للصناعات الغذائية', en: 'Edita Food Industries Company' },
      { symbol: 'SIPC.CA', ar: 'سبأ الدولية للأدوية', en: 'Sabaa International Company for Pharmaceutical and Chemical Industry' },
      { symbol: 'EGCH.CA', ar: 'المصرية للصناعات الكيماوية', en: 'Egyptian Chemical Industries' },
    ],
  },
  {
    id: 'egx-more',
    label: 'البورصة المصرية — بقية الأسهم',
    items: [
      { symbol: 'RAYA.CA', ar: 'راية القابضة', en: 'Raya Holding Company for Financial Investments' },
      { symbol: 'CLHO.CA', ar: 'كليوباترا للمستشفيات', en: 'Cleopatra Hospitals Group' },
      { symbol: 'HDBK.CA', ar: 'بنك التعمير والإسكان', en: 'Housing and Development Bank- Egypt' },
      { symbol: 'SKPC.CA', ar: 'سيدي كرير للبتروكيماويات', en: 'Sidi Kerir Petrochemicals Co.' },
      { symbol: 'MASR.CA', ar: 'مدينة مصر للإسكان', en: 'Madinet Masr For Housing and Development' },
      { symbol: 'JUFO.CA', ar: 'جهينة للصناعات الغذائية', en: 'Juhayna Food Industries' },
      { symbol: 'PRCL.CA', ar: 'العامة للسيراميك والبورسلين', en: 'The General Company for Ceramic and Porcelain Products' },
      { symbol: 'IEEC.CA', ar: 'المشروعات الصناعية والهندسية', en: 'Industrial & Engineering Projects' },
      { symbol: 'RMDA.CA', ar: 'العاشر من رمضان للأدوية — رامدا', en: 'Tenth of Ramadan for Pharmaceutical Industries and Diagnostic Reagents (Rameda)' },
      { symbol: 'ELEC.CA', ar: 'الكابلات الكهربائية المصرية', en: 'Electro Cable Egypt' },
      { symbol: 'OCDI.CA', ar: 'سوديك', en: 'Sixth of October for Development and Investment Company "SODIC"' },
      { symbol: 'ARCC.CA', ar: 'الأسمنت العربية', en: 'Arabian Cement Company' },
      { symbol: 'EFIC.CA', ar: 'المالية والصناعية المصرية', en: 'Egyptian Financial and Industrial' },
      { symbol: 'EGTS.CA', ar: 'المصرية للمنتجعات السياحية', en: 'Egyptian Resorts Company' },
      { symbol: 'SAUD.CA', ar: 'بنك البركة مصر', en: 'alBaraka Bank Egypt' },
      { symbol: 'ASPI.CA', ar: 'أسباير كابيتال القابضة', en: 'Aspire Capital Holding for Financial Investments' },
      { symbol: 'SUGR.CA', ar: 'الدلتا للسكر', en: 'Delta Sugar Company' },
      { symbol: 'ENGC.CA', ar: 'الهندسية الصناعية للإنشاءات', en: 'Industrial Engineering Company for Construction and Development (ICON)' },
      { symbol: 'KABO.CA', ar: 'النصر للملابس والمنسوجات — كابو', en: 'El-Nasr Clothing & Textiles Co. (KABO)' },
      { symbol: 'CANA.CA', ar: 'بنك قناة السويس', en: 'Suez Canal Bank' },
      { symbol: 'LCSW.CA', ar: 'ليسيكو مصر', en: 'Lecico Egypt' },
      { symbol: 'DAPH.CA', ar: 'المهندسون الاستشاريون للتنمية', en: 'Development & Engineering Consultants' },
      { symbol: 'ORWE.CA', ar: 'النساجون الشرقيون', en: 'Oriental Weavers Carpets Company' },
      { symbol: 'CCRS.CA', ar: 'الخليج الكندية للاستثمار العقاري', en: 'Gulf Canadian Company for Arab Real Estate Investment' },
      { symbol: 'ZEOT.CA', ar: 'الزيوت المستخلصة ومشتقاتها', en: 'Extracted Oil & Derivatives Co.' },
      { symbol: 'SDTI.CA', ar: 'شرم دريمز للاستثمار السياحي', en: 'SHARM DREAMS Co. for Touristic Investment' },
      { symbol: 'NCCW.CA', ar: 'النصر للأعمال المدنية', en: 'Nasr Company for Civil Works' },
      { symbol: 'GGCC.CA', ar: 'جيزة العامة للمقاولات', en: 'Giza General - Contracting and Real Estate Investment' },
      { symbol: 'CIRA.CA', ar: 'القاهرة للاستثمار والتنمية العقارية', en: 'Cairo For Investment And Real Estate Developments-CIRA Education' },
      { symbol: 'AALR.CA', ar: 'العامة لاستصلاح الأراضي', en: 'General Company For Land Reclamation, Development & Reconstruction' },
      { symbol: 'COSG.CA', ar: 'القاهرة للزيوت والصابون', en: 'Cairo Oil & Soap Company' },
      { symbol: 'OFH.CA', ar: 'أو بي القابضة المالية', en: 'O B Financial Holding' },
      { symbol: 'ETRS.CA', ar: 'إيجيترانز', en: 'Egyptian Transport & Commercial Services Co. -EGYTRANS NOSCO' },
      { symbol: 'PRDC.CA', ar: 'بايونيرز بروبرتيز', en: 'Pioneers Properties For Urban Development - PRE Group' },
      { symbol: 'ELSH.CA', ar: 'الشمس للإسكان والتعمير', en: 'Al-Shams Company for Housing and Urban Development' },
      { symbol: 'EXPA.CA', ar: 'المصري لتنمية الصادرات', en: 'Export Development Bank of Egypt' },
      { symbol: 'DSCW.CA', ar: 'دايس للملابس الجاهزة', en: 'Dice For Ready-Made Garments' },
      { symbol: 'AMIA.CA', ar: 'الملتقى العربي للاستثمارات', en: 'Arab Moltaqa Investments Company' },
      { symbol: 'ELKA.CA', ar: 'القاهرة للإسكان والتعمير', en: 'Cairo for Housing and Development Company' },
      { symbol: 'MOSC.CA', ar: 'مصر للزيوت والصابون', en: 'Misr Oils & Soap' },
      { symbol: 'KZPC.CA', ar: 'كفر الزيات للمبيدات', en: 'Kafr El Zayat For Pesticides & Chemicals Co.' },
      { symbol: 'SPMD.CA', ar: 'سبيد ميديكال', en: 'Speed Medical Co' },
      { symbol: 'PRMH.CA', ar: 'برايم القابضة', en: 'Prime Holding' },
      { symbol: 'ATLC.CA', ar: 'التوفيق للتأجير التمويلي', en: 'Al Tawfeek Leasing Company' },
      { symbol: 'ISMA.CA', ar: 'الإسماعيلية مصر للدواجن', en: 'Ismailia / Misr Poultry Company' },
      { symbol: 'NINH.CA', ar: 'مستشفى النزهة الدولي', en: 'Nozha International Hospital' },
      { symbol: 'MENA.CA', ar: 'مينا للاستثمار السياحي والعقاري', en: 'Mena for Touristic & Real Estate Investment' },
      { symbol: 'MILS.CA', ar: 'مطاحن شمال القاهرة', en: 'North Cairo Flour Mills' },
      { symbol: 'RREI.CA', ar: 'العربية للاستثمار العقاري', en: 'Arab Real Estate Investment Co.' },
      { symbol: 'GDWA.CA', ar: 'جدوى للتنمية الصناعية', en: 'Gadwa for Industrial Development' },
      { symbol: 'ALCN.CA', ar: 'الإسكندرية لتداول الحاويات', en: 'Alexandria Container&Cargo Handling Company' },
      { symbol: 'SMFR.CA', ar: 'سماد مصر — إيجيفرت', en: 'Samad Misr EGYFERT.' },
      { symbol: 'ROTO.CA', ar: 'رواد السياحة', en: 'Rowad Tourism Company' },
      { symbol: 'CIEB.CA', ar: 'كريدي أجريكول مصر', en: 'Credit Agricole - Egypt Bank' },
      { symbol: 'MICH.CA', ar: 'مصر للصناعات الكيماوية', en: 'Misr Chemical Industries Co.' },
      { symbol: 'ACGC.CA', ar: 'العربية لحليج الأقطان', en: 'Arabia Cotton Ginning Company' },
      { symbol: 'EHDR.CA', ar: 'المصريين للإسكان والتنمية', en: 'Egyptians for Housing & Development Co.' },
      { symbol: 'IRON.CA', ar: 'الحديد والصلب المصرية', en: 'Egyptian Iron and Steel Company' },
      { symbol: 'IDRE.CA', ar: 'الإسماعيلية للتنمية والاستثمار العقاري', en: 'Ismailia Development and Real Estate Co' },
      { symbol: 'BINV.CA', ar: 'بي إنفستمنتس القابضة', en: 'B Investments Holding' },
      { symbol: 'CSAG.CA', ar: 'وكالات الملاحة القناة', en: 'Canal Shipping Agencies Company' },
      { symbol: 'NHPS.CA', ar: 'الوطنية لإسكان المهن', en: 'National Company for Housing Professional Syndicates' },
      { symbol: 'OLFI.CA', ar: 'عبور لاند للصناعات الغذائية', en: 'Obour Land for Food Industries' },
      { symbol: 'OBRI.CA', ar: 'العبور للاستثمار العقاري', en: 'El-Ebour Co. for Real Estate Investment' },
      { symbol: 'IFAP.CA', ar: 'الدولية للمحاصيل الزراعية', en: 'International Company for Agricultural Crops' },
      { symbol: 'ADPC.CA', ar: 'العربية لمنتجات الألبان — آراب ديري', en: 'The Arab Dairy Products Co.' },
      { symbol: 'MHOT.CA', ar: 'مصر للفنادق', en: 'Misr Hotels Company' },
      { symbol: 'UNIP.CA', ar: 'العالمية للورق ومواد التعبئة', en: 'Universal For Paper and Packaging Materials' },
      { symbol: 'ASCM.CA', ar: 'أسكوم للتعدين', en: 'ASEC Company for Mining ASCOM,' },
      { symbol: 'SPIN.CA', ar: 'الإسكندرية للغزل والنسيج', en: 'Alexandria Spinning & Weaving Co.' },
      { symbol: 'AXPH.CA', ar: 'الإسكندرية للأدوية', en: 'Alexandria Co. For Pharmaceuticals & Chemical Industries' },
      { symbol: 'EPCO.CA', ar: 'مصر للدواجن', en: 'Egypt for Poultry' },
      { symbol: 'EGAS.CA', ar: 'مصر للغازات', en: 'Egypt Gas Company' },
      { symbol: 'CPCI.CA', ar: 'القاهرة للأدوية', en: 'Kahira Pharmaceuticals & Chemical Industries Company' },
      { symbol: 'SCTS.CA', ar: 'قناة السويس لتوطين التكنولوجيا', en: 'Suez Canal Company for Technology Settling' },
      { symbol: 'AFDI.CA', ar: 'الأهلي للتنمية والاستثمار', en: 'Al Ahly for Development & Investment' },
      { symbol: 'DOMT.CA', ar: 'دومتي', en: 'Arabian Food Industries Company (DOMTY) -' },
      { symbol: 'ECAP.CA', ar: 'العز للسيراميك والبورسلين', en: 'Al Ezz Ceramics & Porcelain Co.' },
      { symbol: 'UNIT.CA', ar: 'المتحدة للإسكان والتعمير', en: 'United Co. for Housing & Development -' },
      { symbol: 'FAIT.CA', ar: 'بنك فيصل الإسلامي المصري', en: 'Faisal Islamic Bank of Egypt' },
      { symbol: 'CICH.CA', ar: 'سي آي كابيتال القابضة', en: 'CI Capital Holding For Financial Investments' },
      { symbol: 'UEFM.CA', ar: 'مطاحن صعيد مصر', en: 'Upper Egypt Mills Company J.S.C' },
      { symbol: 'RTVC.CA', ar: 'ريميكو لقرى السياحة', en: 'Remco Tourism Villages Construction' },
      { symbol: 'ELWA.CA', ar: 'الوادي للاستثمار الدولي', en: 'El Wadi for International and Investment Development' },
      { symbol: 'WCDF.CA', ar: 'مطاحن وسط وغرب الدلتا', en: 'Middle & West Delta Flour Mills' },
      { symbol: 'GMCI.CA', ar: 'جي إم سي جروب', en: 'GMC Group For Industrial Commercial & Financial Investments' },
      { symbol: 'MOIL.CA', ar: 'ماريديف لخدمات البترول', en: 'Maridive and Oil Services' },
      { symbol: 'NEDA.CA', ar: 'شمال الصعيد للتنمية الزراعية', en: 'Northern Upper Egypt For Development & Agricultural Production Co.' },
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
