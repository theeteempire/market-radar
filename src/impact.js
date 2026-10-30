// تقدير التأثير الآلي: محرك قواعد ثنائي اللغة (عربي/إنجليزي).
// هذا ليس تنبؤًا ولا نصيحة استثمارية؛ إنه تفسير قابل للمراجعة لكلمات مفتاحية.
import { ASSET_BY_ID, ASSET_CLASSES } from './config.js';

export const IMPACT_LABEL = 'تقدير التأثير (آلي)';
export const IMPACT_DISCLAIMER = 'تقدير آلي مبني على كلمات مفتاحية في الخبر، وليس تنبؤًا أو نصيحة استثمارية.';

export const DIRECTION_LABELS = {
  up: { ar: 'إيجابي محتمل', en: 'Potentially bullish', icon: '▲', cls: 'up' },
  down: { ar: 'سلبي محتمل', en: 'Potentially bearish', icon: '▼', cls: 'down' },
  mixed: { ar: 'متأرجح', en: 'Mixed', icon: '◆', cls: 'flat' },
  neutral: { ar: 'محايد', en: 'Neutral', icon: '•', cls: 'flat' },
};

// كل قاعدة: معرّف، تعبير نمطي، وزن (1-3)، ثقة أساسية، تأثيرات، شرح عربي/إنجليزي.
// التأثيرات تستهدف فئة أصل (cls) أو أصلًا محددًا (id).
const RULES = [
  {
    id: 'rate-hike',
    weight: 3,
    re: /\b(rate hike|hike rates?|raise rates?|hawkish|higher-for-longer)\b|رفع (أسعار )?الفائدة|تشديد نقدي/i,
    confidence: 0.68,
    effects: [
      { cls: 'crypto', dir: 'down' },
      { cls: 'gold', dir: 'down' },
      { cls: 'tech', dir: 'down' },
      { id: 'DXY', dir: 'up' },
    ],
    ar: 'رفع الفائدة أو نبرة متشددة يرفع تكلفة التمويل ويضغط على الأصول عالية المخاطر، ويدعم الدولار غالبًا.',
    en: 'Higher rates or a hawkish tone raise funding costs, pressuring risk assets and often supporting the dollar.',
  },
  {
    id: 'rate-cut',
    weight: 3,
    re: /\b(rate cut|cut rates?|dovish|easing cycle)\b|خفض (أسعار )?الفائدة|تيسير نقدي/i,
    confidence: 0.68,
    effects: [
      { cls: 'crypto', dir: 'up' },
      { cls: 'gold', dir: 'up' },
      { cls: 'tech', dir: 'up' },
      { id: 'DXY', dir: 'down' },
    ],
    ar: 'خفض الفائدة أو نبرة تيسيرية يقلل تكلفة التمويل ويدعم الأصول عالية المخاطر والذهب، ويضغط على الدولار غالبًا.',
    en: 'Rate cuts or a dovish tone lower funding costs, supporting risk assets and gold while often pressuring the dollar.',
  },
  {
    id: 'inflation-hot',
    weight: 2,
    re: /\b(inflation (rises|surges|jumps|accelerat\w*|hot)|hot cpi|inflation data)\b|ارتفاع التضخم|تضخم مرتفع|بيانات التضخم/i,
    confidence: 0.56,
    effects: [
      { cls: 'crypto', dir: 'down' },
      { cls: 'gold', dir: 'mixed' },
      { cls: 'tech', dir: 'down' },
      { id: 'DXY', dir: 'up' },
    ],
    ar: 'تضخم أعلى من المتوقع قد يبقي الفائدة مرتفعة، وهو سلبي للنمو والتقنية وقد يختبر الذهب بين الطلب على الملاذ وضغط الفائدة.',
    en: 'Hotter inflation can keep rates higher, weighing on growth/tech while gold balances safe-haven demand against rate pressure.',
  },
  {
    id: 'inflation-cool',
    weight: 2,
    re: /\b(inflation (cools|eases|slows)|cooler cpi|disinflation)\b|تراجع التضخم|تبريد التضخم|تباطؤ التضخم/i,
    confidence: 0.56,
    effects: [
      { cls: 'crypto', dir: 'up' },
      { cls: 'gold', dir: 'up' },
      { cls: 'tech', dir: 'up' },
      { id: 'DXY', dir: 'down' },
    ],
    ar: 'تبريد التضخم يزيد احتمالية تيسير السياسة النقدية، وهو داعم نسبيًا للتقنية والذهب والأصول عالية المخاطر.',
    en: 'Cooling inflation raises the odds of easier policy, a relative tailwind for tech, gold, and risk assets.',
  },
  {
    id: 'fed-generic',
    weight: 1,
    re: /\b(fed|fomc|federal reserve|powell)\b|الفيدرالي|الاحتياطي الفيدرالي/i,
    confidence: 0.34,
    effects: [
      { cls: 'crypto', dir: 'mixed' },
      { cls: 'gold', dir: 'mixed' },
      { cls: 'tech', dir: 'mixed' },
    ],
    ar: 'أي إشارة من الفيدرالي قد تحرك توقعات الفائدة؛ الاتجاه يعتمد على لهجة البيان والبيانات المرافقة.',
    en: 'Any Fed signal can move rate expectations; direction depends on the statement tone and accompanying data.',
  },
  {
    id: 'opec-cut',
    weight: 3,
    re: /\bopec\+?\b.{0,70}\b(cuts?|cutting|reduces?|reducing|lower(s|ing)?)\b|\b(cuts?|cutting|reduces?|reducing|lower(s|ing)?)\b.{0,45}\bproduction\b|خفض الإنتاج|تخفيض الإنتاج/i,
    confidence: 0.72,
    effects: [
      { id: 'WTI', dir: 'up' },
      { id: 'BRENT', dir: 'up' },
      { cls: 'energy', dir: 'up' },
    ],
    ar: 'خفض إنتاج أوبك+ يقلل المعروض ويدعم أسعار النفط، مع احتمال انتقال الضغط التضخمي إلى الأصول الأخرى.',
    en: 'An OPEC+ output cut reduces supply and supports oil prices, with possible inflationary spillover into other assets.',
  },
  {
    id: 'opec-increase',
    weight: 3,
    re: /\bopec\+?\b.{0,70}\b(increase|raise|boost)\b|\b(increase|raise|boost)\b.{0,45}\bproduction\b|زيادة الإنتاج|رفع الإنتاج/i,
    confidence: 0.72,
    effects: [
      { id: 'WTI', dir: 'down' },
      { id: 'BRENT', dir: 'down' },
      { cls: 'energy', dir: 'down' },
    ],
    ar: 'زيادة إنتاج أوبك+ ترفع المعروض وتضغط على أسعار النفط، وقد تخفف ضغط التضخم.',
    en: 'Higher OPEC+ output adds supply, pressuring oil prices and potentially easing inflation pressure.',
  },
  {
    id: 'oil-supply-risk',
    weight: 3,
    re: /\b(supply (cut|disruption)|pipeline attack|tanker attack|strait of hormuz|oil embargo)\b|تعطل الإمدادات|هجوم على (ناقلة|أنبوب)|مضيق هرمز/i,
    confidence: 0.7,
    effects: [
      { id: 'WTI', dir: 'up' },
      { id: 'BRENT', dir: 'up' },
      { cls: 'gold', dir: 'up' },
      { cls: 'crypto', dir: 'down' },
    ],
    ar: 'مخاطر الإمدادات ترفع علاوة المخاطر في النفط وتدعم الذهب، بينما تضغط عادة على الأصول عالية المخاطر.',
    en: 'Supply risk adds an oil risk premium and supports gold, while typically pressuring risk assets.',
  },
  {
    id: 'crypto-hack',
    weight: 3,
    re: /\b(hack(ed|ing)?|exploit(ed)?|breach(ed)?|stolen|theft|heist|rug ?pull)\b|اختراق|سرقة|استغلال ثغرة|سحب البساط/i,
    confidence: 0.74,
    effects: [
      { cls: 'crypto', dir: 'down' },
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'حادث اختراق أو سرقة يضعف الثقة قصير الأجل في القطاع المتأثر ويزيد مخاوف المخاطر السيبرانية.',
    en: 'A hack or theft weakens short-term confidence in the affected sector and raises cyber-risk concerns.',
  },
  {
    id: 'crypto-etf',
    weight: 3,
    re: /\betf\b.{0,50}\b(approv|launch|greenlight|inflow)\w*|\b(approv|launch|greenlight)\w*.{0,40}\betf\b|موافقة.{0,35}(صندوق|ETF)|تدفق.{0,25}الصناديق/i,
    confidence: 0.72,
    effects: [
      { cls: 'crypto', dir: 'up' },
    ],
    ar: 'موافقة أو تدفقات صناديق مؤشرة تزيد الطلب المؤسسي المتاح وتدعم العملات الرقمية نسبيًا.',
    en: 'ETF approval or inflows expand institutional demand and are a relative tailwind for crypto.',
  },
  {
    id: 'crypto-ban',
    weight: 3,
    re: /\b(ban(s|ned|ning)?|crackdown)\b.{0,45}\b(crypto|bitcoin|mining|exchange)\b|حظر.{0,35}(العملات|التعدين|التداول)/i,
    confidence: 0.7,
    effects: [
      { cls: 'crypto', dir: 'down' },
    ],
    ar: 'حظر أو حملة تنظيمية صارمة يقلل السيولة والمشاركة في السوق المستهدف ويضغط على الأسعار.',
    en: 'A ban or strict crackdown reduces liquidity and participation in the targeted market, pressuring prices.',
  },
  {
    id: 'bankruptcy',
    weight: 3,
    re: /\b(bankrupt(cy)?|insolven(cy|t)|liquidation|chapter 11)\b|إفلاس|تصفية|تصفية قسرية/i,
    confidence: 0.68,
    effects: [
      { cls: 'crypto', dir: 'down' },
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'إفلاس أو تصفية يرفع مخاوف العدوى المالية ويضغط على الأصول المرتبطة بالقطاع المتأثر.',
    en: 'Bankruptcy or liquidation raises contagion concerns and pressures assets linked to the affected sector.',
  },
  {
    id: 'regulation',
    weight: 2,
    re: /\b(sec|regulator\w*|lawsuit|antitrust|probe|investigation)\b.{0,70}\b(crypto|exchange|google|apple|meta|amazon|microsoft|nvidia|ai)\b|تنظيم|دعوى|تحقيق|مكافحة الاحتكار/i,
    confidence: 0.48,
    effects: [
      { cls: 'crypto', dir: 'down' },
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'مخاطر تنظيمية أو قانونية تزيد عدم اليقين وقد ترفع تكاليف الامتثال، وهو عبء نسبي على القطاع.',
    en: 'Regulatory or legal risk raises uncertainty and compliance costs, a relative drag on the sector.',
  },
  {
    id: 'ai-demand',
    weight: 3,
    re: /\b(ai (chip|chips|demand|boom)|artificial intelligence demand|data ?center|gpu demand|h100|blackwell)\b|الطلب على (شرائح|رقائق) الذكاء الاصطناعي|مراكز البيانات|طلب قوي على AI/i,
    confidence: 0.66,
    effects: [
      { id: 'NVDA', dir: 'up' },
      { id: 'AMD', dir: 'up' },
      { id: 'TSM', dir: 'up' },
      { id: 'AVGO', dir: 'up' },
      { cls: 'tech', dir: 'up' },
    ],
    ar: 'طلب قوي على شرائح ومراكز بيانات الذكاء الاصطناعي يدعم مورّدي الرقائق والبنية التحتية التقنية.',
    en: 'Strong AI chip and data-center demand supports chip suppliers and technology infrastructure names.',
  },
  {
    id: 'nvidia-positive',
    weight: 3,
    re: /\b(nvidia|nvda)\b.{0,90}\b(beat|surge|jump|record|strong|demand|rally|upgrade|soar)\b|\b(beat|surge|jump|record|strong|demand|rally|upgrade|soar)\b.{0,90}\b(nvidia|nvda)\b|إنفيديا.{0,70}(قفزة|ارتفاع|نتائج قوية|طلب)/i,
    confidence: 0.7,
    effects: [
      { id: 'NVDA', dir: 'up' },
      { id: 'AMD', dir: 'up' },
      { id: 'TSM', dir: 'up' },
      { id: 'AVGO', dir: 'up' },
      { cls: 'tech', dir: 'up' },
    ],
    ar: 'نتائج أو طلب قوي مرتبط بـ Nvidia يعزز معنويات قطاع الشرائح والذكاء الاصطناعي ككل.',
    en: 'Strong Nvidia results or demand lift sentiment across the AI and semiconductor complex.',
  },
  {
    id: 'nvidia-negative',
    weight: 3,
    re: /\b(nvidia|nvda)\b.{0,90}\b(miss|fall|drop|weak|cut|downgrade|probe|slump)\b|إنفيديا.{0,70}(هبوط|تراجع|ضعف|خفض)/i,
    confidence: 0.68,
    effects: [
      { id: 'NVDA', dir: 'down' },
      { id: 'AMD', dir: 'down' },
      { id: 'TSM', dir: 'down' },
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'نتائج مخيبة أو تراجع في الطلب على شرائح Nvidia قد يضغط على القطاع التقني واسع النطاق.',
    en: 'Disappointing Nvidia results or demand weakness can pressure the broader technology sector.',
  },
  {
    id: 'chip-export',
    weight: 3,
    re: /\b(export (controls?|restrictions?|ban)|chip (ban|restrictions?)|entity list)\b|قيود التصدير|حظر تصدير (الشرائح|الرقائق)/i,
    confidence: 0.7,
    effects: [
      { id: 'NVDA', dir: 'down' },
      { id: 'AMD', dir: 'down' },
      { id: 'TSM', dir: 'down' },
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'قيود تصدير الشرائح تقيّد الأسواق المتاحة لمورّدي الرقائق وتضغط على أسهم القطاع.',
    en: 'Chip export restrictions shrink addressable markets for suppliers and pressure semiconductor stocks.',
  },
  {
    id: 'openai',
    weight: 2,
    re: /\b(openai|chatgpt|gpt-?5|sam altman)\b|أوبن إيه آي|شات جي بي تي/i,
    confidence: 0.5,
    effects: [
      { id: 'MSFT', dir: 'up' },
      { id: 'NVDA', dir: 'up' },
      { cls: 'tech', dir: 'up' },
    ],
    ar: 'تطورات OpenAI/ChatGPT تعزز عادة معنويات الذكاء الاصطناعي، مع ارتباط مباشر بـ Microsoft ومورّدي الحوسبة.',
    en: 'OpenAI/ChatGPT developments usually lift AI sentiment, with direct links to Microsoft and compute suppliers.',
  },
  {
    id: 'apple-positive',
    weight: 2,
    re: /\b(apple|aapl|iphone)\b.{0,80}\b(beat|surge|record|strong|demand|upgrade|launch)\b|\b(beat|surge|record|strong|demand|upgrade|launch)\b.{0,80}\b(apple|aapl|iphone)\b|أبل|آيفون/i,
    confidence: 0.54,
    effects: [
      { id: 'AAPL', dir: 'up' },
      { cls: 'tech', dir: 'up' },
    ],
    ar: 'أخبار إيجابية عن Apple أو iPhone تدعم السهم ومعنويات التقنية الاستهلاكية.',
    en: 'Positive Apple or iPhone news supports the stock and consumer-tech sentiment.',
  },
  {
    id: 'apple-negative',
    weight: 2,
    re: /\b(apple|aapl|iphone)\b.{0,80}\b(miss|fall|drop|weak|cut|downgrade|probe|slow)\b|أبل.{0,60}(تراجع|هبوط|ضعف|خفض)/i,
    confidence: 0.54,
    effects: [
      { id: 'AAPL', dir: 'down' },
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'أخبار سلبية عن Apple أو iPhone قد تضغط على السهم ومعنويات قطاع التقنية.',
    en: 'Negative Apple or iPhone news can pressure the stock and technology sentiment.',
  },
  {
    id: 'tesla',
    weight: 2,
    re: /\b(tesla|tsla|robotaxi|full self-driving|elon musk)\b|تسلا|إيلون ماسك/i,
    confidence: 0.46,
    effects: [
      { id: 'TSLA', dir: 'mixed' },
      { cls: 'tech', dir: 'mixed' },
    ],
    ar: 'أخبار Tesla عالية التقلب؛ التأثير يعتمد على طبيعة الخبر (تسليمات، تنظيم، منتج) لا على ذكر الشركة وحده.',
    en: 'Tesla news is high-beta; impact depends on the specific catalyst (deliveries, regulation, product), not the mention alone.',
  },
  {
    id: 'war',
    weight: 3,
    re: /\b(war|invasion|airstrike|missile|military strike|geopolitical|conflict)\b|حرب|غزو|ضربة (عسكرية|جوية)|صاروخ|توتر جيوسياسي/i,
    confidence: 0.7,
    effects: [
      { cls: 'gold', dir: 'up' },
      { id: 'WTI', dir: 'up' },
      { id: 'BRENT', dir: 'up' },
      { cls: 'crypto', dir: 'down' },
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'تصعيد جيوسياسي يرفع الطلب على الملاذات الآمنة والنفط، ويضغط عادة على الأصول عالية المخاطر.',
    en: 'Geopolitical escalation boosts safe havens and oil while typically pressuring risk assets.',
  },
  {
    id: 'sanctions',
    weight: 2,
    re: /\b(sanctions?|embargo)\b|عقوبات|حظر نفطي/i,
    confidence: 0.58,
    effects: [
      { id: 'WTI', dir: 'up' },
      { id: 'BRENT', dir: 'up' },
      { cls: 'gold', dir: 'up' },
    ],
    ar: 'عقوبات أو حظر قد يقيد الإمدادات ويرفع علاوة المخاطر في الطاقة ويدعم الذهب.',
    en: 'Sanctions or embargoes can constrain supply, adding an energy risk premium and supporting gold.',
  },
  {
    id: 'dollar-strength',
    weight: 2,
    re: /\b(dollar (strengthens|surges|rallies)|dxy (rises|jumps)|strong dollar)\b|قوة الدولار|صعود الدولار|ارتفاع الدولار/i,
    confidence: 0.58,
    effects: [
      { cls: 'gold', dir: 'down' },
      { cls: 'crypto', dir: 'down' },
      { cls: 'tech', dir: 'down' },
      { id: 'DXY', dir: 'up' },
    ],
    ar: 'دولار أقوى يرفع تكلفة الأصول المقومة بالدولار ويضغط على الذهب والسلع والأصول عالية المخاطر.',
    en: 'A stronger dollar raises the cost of dollar-denominated assets and pressures gold, commodities, and risk assets.',
  },
  {
    id: 'dollar-weakness',
    weight: 2,
    re: /\b(dollar (weakens|falls|slips)|weak dollar)\b|تراجع الدولار|ضعف الدولار/i,
    confidence: 0.56,
    effects: [
      { cls: 'gold', dir: 'up' },
      { cls: 'crypto', dir: 'up' },
      { cls: 'tech', dir: 'up' },
      { id: 'DXY', dir: 'down' },
    ],
    ar: 'دولار أضعف يخفف ضغط التمويل ويدعم الذهب والسلع والأصول عالية المخاطر نسبيًا.',
    en: 'A weaker dollar eases funding pressure and is a relative tailwind for gold, commodities, and risk assets.',
  },
  {
    id: 'recession',
    weight: 3,
    re: /\b(recession|economic slowdown|hard landing|gdp (falls|contracts))\b|ركود|تباطؤ اقتصادي|هبوط حاد/i,
    confidence: 0.62,
    effects: [
      { cls: 'crypto', dir: 'down' },
      { cls: 'tech', dir: 'down' },
      { cls: 'gold', dir: 'up' },
      { id: 'WTI', dir: 'down' },
    ],
    ar: 'مخاوف الركود تضغط على النمو والتقنية والنفط، وقد تدعم الذهب كملاذ آمن.',
    en: 'Recession fears pressure growth, tech, and oil, while potentially supporting gold as a safe haven.',
  },
  {
    id: 'gold-haven',
    weight: 2,
    re: /\b(safe haven|haven demand|gold (surges|jumps|rallies|record))\b|ملاذ آمن|الذهب (يقفز|يرتفع|يسجل)/i,
    confidence: 0.6,
    effects: [
      { cls: 'gold', dir: 'up' },
    ],
    ar: 'طلب الملاذ الآمن يدعم الذهب والفضة، خصوصًا عند تزامنه مع مخاوف اقتصادية أو جيوسياسية.',
    en: 'Safe-haven demand supports gold and silver, especially alongside economic or geopolitical stress.',
  },
  {
    id: 'earnings-beat',
    weight: 2,
    re: /\b(earnings beat|beats? estimates|raises guidance|strong results)\b|تجاوز التوقعات|نتائج قوية|رفع التوقعات/i,
    confidence: 0.55,
    effects: [
      { cls: 'tech', dir: 'up' },
    ],
    ar: 'نتائج تتجاوز التوقعات أو رفع التوجيهات يدعم القطاع، لكن التأثير يتركّز عادة في الشركة المعلنة.',
    en: 'A beat or raised guidance supports the sector, though the effect is usually concentrated in the reporting company.',
  },
  {
    id: 'earnings-miss',
    weight: 2,
    re: /\b(earnings miss|misses? estimates|cuts guidance|weak results)\b|دون التوقعات|نتائج ضعيفة|خفض التوقعات/i,
    confidence: 0.55,
    effects: [
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'نتائج دون التوقعات أو خفض التوجيهات يضغط على القطاع، مع تركّز التأثير في الشركة المعلنة.',
    en: 'A miss or cut guidance pressures the sector, with the effect usually concentrated in the reporting company.',
  },
  {
    id: 'ai-regulation',
    weight: 2,
    re: /\b(ai (regulation|rules|laws?|act)|regulate ai|ai safety)\b|تنظيم الذكاء الاصطناعي|قانون الذكاء الاصطناعي/i,
    confidence: 0.5,
    effects: [
      { cls: 'tech', dir: 'down' },
    ],
    ar: 'تنظيم الذكاء الاصطناعي قد يرفع تكاليف الامتثال ويبطئ بعض المنتجات، وهو عبء نسبي على القطاع.',
    en: 'AI regulation can raise compliance costs and slow some product rollouts, a relative drag on the sector.',
  },
  {
    id: 'jobs-strong',
    weight: 2,
    re: /\b(strong jobs|jobs beat|payrolls (rise|surge)|unemployment (falls|drops))\b|وظائف قوية|تراجع البطالة/i,
    confidence: 0.52,
    effects: [
      { cls: 'crypto', dir: 'down' },
      { cls: 'tech', dir: 'down' },
      { id: 'DXY', dir: 'up' },
    ],
    ar: 'سوق عمل قوي قد يبقي الفائدة مرتفعة لفترة أطول، وهو ضغط نسبي على الأصول عالية المخاطر ودعم للدولار.',
    en: 'A strong labor market can keep rates higher for longer, a relative drag on risk assets and a dollar tailwind.',
  },
  {
    id: 'jobs-weak',
    weight: 2,
    re: /\b(weak jobs|jobs miss|payrolls (fall|slow)|unemployment (rises|jumps))\b|وظائف ضعيفة|ارتفاع البطالة/i,
    confidence: 0.52,
    effects: [
      { cls: 'crypto', dir: 'up' },
      { cls: 'gold', dir: 'up' },
      { cls: 'tech', dir: 'up' },
      { id: 'DXY', dir: 'down' },
    ],
    ar: 'ضعف سوق العمل يزيد توقعات التيسير، وهو داعم نسبي للأصول عالية المخاطر والذهب.',
    en: 'Labor-market weakness raises easing expectations, a relative tailwind for risk assets and gold.',
  },
  {
    id: 'crypto-adoption',
    weight: 2,
    re: /\b(adoption|institutional|treasury .{0,25}bitcoin|etf inflow|blackrock)\b|تبني|مؤسسي|تدفق.{0,25}صندوق/i,
    confidence: 0.54,
    effects: [
      { cls: 'crypto', dir: 'up' },
    ],
    ar: 'تبنٍّ مؤسسي أو تدفقات جديدة يوسّع قاعدة الطلب ويدعم العملات الرقمية نسبيًا.',
    en: 'Institutional adoption or fresh inflows broaden demand and are a relative tailwind for crypto.',
  },
  {
    id: 'exchange-outage',
    weight: 3,
    re: /\b(outage|halts? withdrawals|suspends? withdrawals|network (down|halt)|withdrawals? (paused|halted))\b|توقف السحب|تعطل الشبكة|إيقاف السحب/i,
    confidence: 0.66,
    effects: [
      { cls: 'crypto', dir: 'down' },
    ],
    ar: 'تعطل منصة أو إيقاف السحب يضعف الثقة والسيولة قصير الأجل ويضغط على القطاع.',
    en: 'An exchange outage or withdrawal halt weakens short-term confidence and liquidity, pressuring the sector.',
  },
];

const BREAKING_TAGS = new Set([
  'rate-hike', 'rate-cut', 'opec-cut', 'opec-increase', 'crypto-hack',
  'crypto-etf', 'crypto-ban', 'bankruptcy', 'war', 'sanctions',
  'chip-export', 'exchange-outage',
]);

const GENERIC = {
  crypto: {
    effects: [{ cls: 'crypto', dir: 'neutral' }],
    ar: 'لا توجد إشارة اتجاهية واضحة في العنوان؛ قد يتحرك السوق مع السيولة العامة أو الأخبار الكلية.',
    en: 'No clear directional catalyst in the headline; price may follow broad liquidity or macro news.',
  },
  gold: {
    effects: [{ cls: 'gold', dir: 'neutral' }],
    ar: 'لا توجد إشارة اتجاهية واضحة؛ يرتبط الذهب عادة بالدولار وعوائد السندات والمخاوف الجيوسياسية.',
    en: 'No clear directional catalyst; gold usually tracks the dollar, yields, and geopolitical risk.',
  },
  energy: {
    effects: [{ cls: 'energy', dir: 'neutral' }],
    ar: 'لا توجد إشارة اتجاهية واضحة؛ يبقى التركيز على الإمدادات والمخزونات وطلب الاقتصاد العالمي.',
    en: 'No clear directional catalyst; focus remains on supply, inventories, and global demand.',
  },
  tech: {
    effects: [{ cls: 'tech', dir: 'neutral' }],
    ar: 'لا توجد إشارة اتجاهية واضحة؛ قد يتبع السهم قطاعه أو نتائج الأرباح القادمة.',
    en: 'No clear directional catalyst; the stock may follow its sector or upcoming earnings.',
  },
  macro: {
    effects: [{ cls: 'macro', dir: 'neutral' }],
    ar: 'لا توجد إشارة اتجاهية واضحة؛ الخبر كلي وقد يظهر تأثيره عبر الفائدة والدولار لاحقًا.',
    en: 'No clear directional catalyst; this is macro news whose effect may show up later via rates and the dollar.',
  },
  general: {
    effects: [{ cls: 'general', dir: 'neutral' }],
    ar: 'لا توجد إشارة اتجاهية واضحة في هذا الخبر حتى الآن.',
    en: 'No clear directional catalyst in this item yet.',
  },
};

function classLabel(cls) {
  if (cls === 'general') return 'عام';
  return ASSET_CLASSES[cls]?.short || cls;
}

function resolveEffects(effects) {
  const merged = new Map();
  for (const effect of effects) {
    const key = effect.id || effect.cls;
    if (!key) continue;
    if (!merged.has(key)) {
      merged.set(key, { key, dirs: [], cls: effect.cls || ASSET_BY_ID.get(effect.id)?.cls || '' });
    }
    merged.get(key).dirs.push(effect.dir);
  }
  return [...merged.values()].map((entry) => {
    // الإشارة الاتجاهية الصريحة تتقدّم على «متأرجح» القادمة من قاعدة عامة أضعف،
    // وإلا فإن ذكر الفيدرالي وحده يمحو أثر قاعدة رفع الفائدة.
    const directional = [...new Set(entry.dirs.filter((d) => d === 'up' || d === 'down'))];
    let dir;
    if (directional.length === 1) dir = directional[0];
    else if (directional.length > 1) dir = 'mixed';
    else if (entry.dirs.includes('mixed')) dir = 'mixed';
    else dir = 'neutral';
    const asset = ASSET_BY_ID.get(entry.key);
    return {
      key: entry.key,
      label: asset ? asset.symbol : classLabel(entry.key),
      name: asset ? asset.name : ASSET_CLASSES[entry.key]?.label || entry.key,
      dir,
      cls: entry.cls,
    };
  });
}

function overallDirection(effects) {
  const dirs = effects.map((e) => e.dir).filter((d) => d === 'up' || d === 'down');
  if (!dirs.length) return effects.some((e) => e.dir === 'mixed') ? 'mixed' : 'neutral';
  const up = dirs.filter((d) => d === 'up').length;
  const down = dirs.filter((d) => d === 'down').length;
  if (up && down) return 'mixed';
  return up ? 'up' : 'down';
}

function recencyBonus(ts, now) {
  const age = Math.max(0, now - Number(ts || now));
  if (age <= 10 * 60 * 1000) return 10;
  if (age <= 60 * 60 * 1000) return 5;
  if (age <= 6 * 60 * 60 * 1000) return 2;
  return 0;
}

// يقدّر التأثير ويعيد أيضًا مؤشرات «عاجل» وأهمية رقمية للواجهة.
export function assessNews(item, { now = Date.now() } = {}) {
  const title = String(item?.title || '');
  const summary = String(item?.summary || '');
  const text = `${title} ${summary}`;
  const cls = item?.cls || 'general';

  const matched = RULES.filter((rule) => rule.re.test(text));
  const generic = GENERIC[cls] || GENERIC.general;

  const effects = resolveEffects(
    matched.length ? matched.flatMap((rule) => rule.effects) : generic.effects,
  );
  const direction = overallDirection(effects);

  let confidence;
  if (matched.length) {
    const base = Math.max(...matched.map((rule) => rule.confidence));
    confidence = base + Math.min(0.12, (matched.length - 1) * 0.035);
    // تعارض الاتجاهات على نفس الأصل يقلل الثقة.
    if (effects.some((e) => e.dir === 'mixed')) confidence -= 0.06;
    confidence = Math.max(0.3, Math.min(0.85, confidence));
  } else {
    confidence = cls === 'general' ? 0.16 : 0.22;
  }

  const weight = matched.reduce((sum, rule) => sum + (rule.weight || 1), 0);
  const score = Math.max(
    8,
    Math.min(99, Math.round(confidence * 72 + Math.min(18, weight * 4))),
  );

  const ar = matched.length
    ? [...new Set(matched.map((rule) => rule.ar))].slice(0, 3).join(' ')
    : generic.ar;
  const en = matched.length
    ? [...new Set(matched.map((rule) => rule.en))].slice(0, 3).join(' ')
    : generic.en;

  const tags = matched.map((rule) => rule.id);
  const breaking = tags.some((tag) => BREAKING_TAGS.has(tag))
    || (score >= 74 && confidence >= 0.62);
  const importance = Math.max(0, Math.min(100, score + recencyBonus(item?.ts, now)));

  return {
    impact: {
      label: IMPACT_LABEL,
      disclaimer: IMPACT_DISCLAIMER,
      direction,
      directionLabel: DIRECTION_LABELS[direction].ar,
      confidence: Number(confidence.toFixed(2)),
      score,
      horizon: 'قصير الأجل (ساعات إلى أيام)',
      assets: effects.slice(0, 6),
      rationale: ar.slice(0, 520),
      rationaleEn: en.slice(0, 520),
      tags,
      automated: true,
    },
    breaking,
    importance,
  };
}

export function isBreaking(item, { now = Date.now() } = {}) {
  return assessNews(item, { now }).breaking;
}
