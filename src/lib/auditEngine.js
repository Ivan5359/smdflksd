export const APP_VERSION = "SITEMONEY_AUDIT_20260618_2330_ENTRYPOINT_FIX";

const CTA_TERMS = [
  "book",
  "booking",
  "call",
  "contact",
  "quote",
  "estimate",
  "appointment",
  "schedule",
  "buy",
  "order",
  "reserve",
  "запис",
  "позвон",
  "заявк",
  "консультац"
];

const LOCAL_TERMS = [
  "near me",
  "serving",
  "service area",
  "address",
  "hours",
  "map",
  "directions",
  "reviews",
  "google",
  "yelp",
  "город",
  "адрес",
  "отзывы"
];

const TRUST_TERMS = [
  "review",
  "reviews",
  "testimonial",
  "licensed",
  "insured",
  "guarantee",
  "warranty",
  "case study",
  "before",
  "after",
  "отзыв",
  "гарант",
  "лиценз"
];

export function normalizeUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    throw new Error("Добавь URL сайта для аудита.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Поддерживаются только http и https ссылки.");
  }
  url.hash = "";
  return url.toString();
}

export function createFallbackFacts(input, reason = "Сайт недоступен для fetch-аудита.") {
  let finalUrl = "";
  let host = "unknown-site";
  try {
    finalUrl = normalizeUrl(input.url);
    host = new URL(finalUrl).hostname;
  } catch {
    finalUrl = String(input.url || "");
  }

  return {
    source: "fallback",
    fetchError: reason,
    finalUrl,
    host,
    status: 0,
    loadMs: 0,
    pageSizeKb: 0,
    title: "",
    metaDescription: "",
    h1: [],
    wordCount: 0,
    hasViewport: false,
    isHttps: finalUrl.startsWith("https://"),
    hasPhone: false,
    hasEmail: false,
    forms: 0,
    ctaCount: 0,
    ctaSamples: [],
    hasBooking: false,
    hasReviews: false,
    hasSocialLinks: false,
    hasMaps: false,
    hasSchema: false,
    hasAnalytics: false,
    hasOgTags: false,
    imageAltRatio: 0,
    linksCount: 0,
    securityHeaders: {
      hsts: false,
      csp: false,
      frameOptions: false
    },
    textSignals: {
      ctaTerms: 0,
      localTerms: 0,
      trustTerms: 0
    }
  };
}

export function buildReport(input, facts) {
  const normalizedInput = normalizeInput(input);
  const safeFacts = { ...createFallbackFacts(normalizedInput), ...facts };
  const categories = scoreCategories(normalizedInput, safeFacts);
  const total = clamp(
    Math.round(
      categories.conversion.value * 0.32 +
        categories.moneyPath.value * 0.2 +
        categories.trust.value * 0.18 +
        categories.localIntent.value * 0.14 +
        categories.technical.value * 0.16
    ),
    1,
    100
  );

  const priorities = buildPriorities(normalizedInput, safeFacts, categories);
  const money = estimateMoney(normalizedInput, priorities, total);
  const report = {
    id: createReportId(safeFacts.host),
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    input: normalizedInput,
    host: safeFacts.host,
    finalUrl: safeFacts.finalUrl || normalizedInput.url,
    businessName: inferBusinessName(safeFacts, normalizedInput),
    score: {
      total,
      grade: scoreGrade(total),
      label: scoreLabel(total),
      categories
    },
    facts: safeFacts,
    evidence: buildEvidence(safeFacts),
    priorities,
    money,
    outreach: buildOutreach(normalizedInput, safeFacts, priorities, money),
    package: buildPackage(normalizedInput, priorities, money),
    automation: buildAutomationPlan(normalizedInput, safeFacts, priorities),
    crm: buildCrmPlan(normalizedInput, safeFacts, priorities, money),
    nextActions: buildNextActions(normalizedInput, safeFacts, priorities)
  };

  return report;
}

export function createDemoReport() {
  const input = {
    url: "https://demo-plumbing.example",
    niche: "plumber",
    city: "Austin",
    averageSale: 420,
    monthlyVisitors: 850,
    mode: "agent"
  };

  const facts = {
    source: "demo",
    finalUrl: input.url,
    host: "demo-plumbing.example",
    status: 200,
    loadMs: 1420,
    pageSizeKb: 286,
    title: "Austin Emergency Plumbing | Fast Repairs",
    metaDescription: "Local plumbing services in Austin.",
    h1: ["Fast plumbing repairs"],
    wordCount: 1240,
    hasViewport: true,
    isHttps: true,
    hasPhone: true,
    phone: "(512) 555-0184",
    hasEmail: false,
    forms: 0,
    ctaCount: 2,
    ctaSamples: ["Call now", "Request service"],
    hasBooking: false,
    hasReviews: true,
    hasSocialLinks: true,
    hasMaps: false,
    hasSchema: false,
    hasAnalytics: true,
    hasOgTags: true,
    imageAltRatio: 38,
    linksCount: 41,
    securityHeaders: {
      hsts: true,
      csp: false,
      frameOptions: true
    },
    textSignals: {
      ctaTerms: 3,
      localTerms: 4,
      trustTerms: 3
    }
  };

  return buildReport(input, facts);
}

function normalizeInput(input) {
  const averageSale = Number(input.averageSale || 250);
  const monthlyVisitors = Number(input.monthlyVisitors || 600);

  return {
    url: normalizeUrl(input.url || "https://demo-plumbing.example"),
    niche: String(input.niche || "local service").trim(),
    city: String(input.city || "Austin").trim(),
    averageSale: Number.isFinite(averageSale) && averageSale > 0 ? averageSale : 250,
    monthlyVisitors:
      Number.isFinite(monthlyVisitors) && monthlyVisitors > 0 ? monthlyVisitors : 600,
    mode: input.mode || "fast",
    autopilot: Boolean(input.autopilot),
    createCrmTasks: input.createCrmTasks !== false,
    autoExport: Boolean(input.autoExport)
  };
}

function scoreCategories(input, facts) {
  return {
    conversion: {
      label: "Конверсия",
      value: clamp(
        points([
          [facts.ctaCount >= 3, 24],
          [facts.ctaCount > 0, 12],
          [facts.hasPhone, 18],
          [facts.forms > 0, 16],
          [facts.hasBooking, 16],
          [Boolean(facts.metaDescription), 8],
          [facts.h1?.length === 1, 6]
        ]),
        5,
        100
      )
    },
    moneyPath: {
      label: "Путь к заявке",
      value: clamp(
        points([
          [facts.hasPhone || facts.hasEmail, 22],
          [facts.forms > 0 || facts.hasBooking, 22],
          [facts.textSignals.ctaTerms >= 4, 18],
          [facts.ctaSamples?.length > 1, 14],
          [facts.linksCount > 10, 10],
          [facts.wordCount > 500, 14]
        ]),
        5,
        100
      )
    },
    trust: {
      label: "Доверие",
      value: clamp(
        points([
          [facts.hasReviews, 22],
          [facts.hasSchema, 18],
          [facts.hasSocialLinks, 12],
          [facts.hasOgTags, 12],
          [facts.hasEmail, 12],
          [facts.textSignals.trustTerms >= 3, 14],
          [facts.imageAltRatio >= 60, 10]
        ]),
        5,
        100
      )
    },
    localIntent: {
      label: "Локальный спрос",
      value: clamp(
        points([
          [textIncludes(facts, input.city), 22],
          [textIncludes(facts, input.niche), 16],
          [facts.hasMaps, 18],
          [facts.hasPhone, 14],
          [facts.textSignals.localTerms >= 3, 16],
          [facts.hasReviews, 14]
        ]),
        5,
        100
      )
    },
    technical: {
      label: "Техника",
      value: clamp(
        points([
          [facts.isHttps, 16],
          [facts.hasViewport, 18],
          [facts.status >= 200 && facts.status < 400, 16],
          [facts.loadMs > 0 && facts.loadMs < 2600, 16],
          [facts.pageSizeKb > 0 && facts.pageSizeKb < 900, 12],
          [facts.hasAnalytics, 8],
          [facts.securityHeaders?.hsts, 7],
          [facts.securityHeaders?.frameOptions || facts.securityHeaders?.csp, 7]
        ]),
        5,
        100
      )
    }
  };
}

function buildPriorities(input, facts, categories) {
  const items = [];

  if (!facts.hasPhone && !facts.hasEmail) {
    items.push(priority("contact", "Нет быстрого контакта", "high", 24, "Владелец теряет горячие заявки, потому что клиенту некуда сразу нажать.", "Добавить закрепленный CTA, кликабельный телефон и короткую форму."));
  }
  if (!facts.hasBooking && facts.forms === 0) {
    items.push(priority("booking", "Нет формы заявки", "high", 22, "Можно продать быстрый lead-capture блок и сразу показать измеримый результат.", "Поставить мини-форму: имя, телефон, задача, удобное время."));
  }
  if (facts.ctaCount < 2) {
    items.push(priority("cta", "Слабый призыв к действию", "high", 18, "Сайт выглядит как визитка, а не как машина заявок.", "Повторить CTA в первом экране, после доказательств и внизу страницы."));
  }
  if (!facts.hasReviews) {
    items.push(priority("proof", "Мало доказательств доверия", "medium", 14, "Без отзывов и гарантий холодный клиент сомневается и уходит сравнивать.", "Добавить отзывы, фото работ, гарантию и короткий блок “почему нам доверяют”."));
  }
  if (!facts.hasMaps || categories.localIntent.value < 55) {
    items.push(priority("local", "Слабая локальная выдача", "medium", 12, "Для локального бизнеса это прямой повод купить улучшение страницы под город.", `Добавить ${input.city}, районы, карту, часы работы и service-area блок.`));
  }
  if (!facts.hasSchema) {
    items.push(priority("schema", "Нет schema-разметки", "medium", 10, "Это недорогая техническая правка, которую легко объяснить как SEO-гигиену.", "Добавить LocalBusiness/Service schema, телефон, адрес и рейтинг."));
  }
  if (!facts.hasViewport || !facts.isHttps) {
    items.push(priority("mobile-security", "Мобильная/HTTPS база не закрыта", "high", 18, "Такая проблема выглядит серьезно и хорошо продается как быстрый фикс.", "Проверить mobile viewport, SSL, редиректы и основные security headers."));
  }
  if (facts.loadMs > 3000 || facts.pageSizeKb > 1000) {
    items.push(priority("speed", "Сайт ощущается медленным", "medium", 12, "Скорость удобно продавать через потерянные заявки и мобильных клиентов.", "Сжать изображения, убрать лишние скрипты, включить кеш и lazy loading."));
  }
  if (facts.imageAltRatio < 50) {
    items.push(priority("images", "Изображения не помогают SEO", "low", 6, "Маленькая правка, которую можно добавить в пакет без перегруза.", "Добавить alt-тексты с услугой, городом и смыслом фото."));
  }

  if (!items.length) {
    items.push(priority("growth", "Сайт уже неплохой, продавай рост", "medium", 10, "Лучший заход: не чинить сломанное, а добавить измеримую систему заявок.", "Предложить A/B CTA, tracking, follow-up и отчетность по лидам."));
  }

  return items.sort((a, b) => b.moneyWeight - a.moneyWeight).slice(0, 8);
}

function estimateMoney(input, priorities, score) {
  const severityLift = priorities.reduce((sum, item) => sum + item.moneyWeight, 0);
  const conversionLift = clamp(Math.round((100 - score + severityLift) / 8), 5, 28);
  const extraLeads = Math.max(2, Math.round(input.monthlyVisitors * (conversionLift / 100) * 0.12));
  const monthlyOpportunity = Math.max(input.averageSale * 2, extraLeads * input.averageSale);
  const confidence = clamp(
    Math.round(42 + priorities.length * 5 + (score < 70 ? 12 : 0) + (input.monthlyVisitors > 500 ? 8 : 0)),
    35,
    88
  );

  return {
    conversionLift,
    extraLeads,
    monthlyOpportunity,
    confidence,
    disclaimer: "Оценка нужна для продажи разговора. Это не гарантия дохода."
  };
}

function buildEvidence(facts) {
  return [
    evidence("HTTP статус", facts.status || "нет ответа", facts.status >= 200 && facts.status < 400),
    evidence("HTTPS", facts.isHttps ? "да" : "нет", facts.isHttps),
    evidence("Mobile viewport", facts.hasViewport ? "есть" : "нет", facts.hasViewport),
    evidence("CTA найдено", facts.ctaCount, facts.ctaCount >= 2),
    evidence("Телефон", facts.hasPhone ? facts.phone || "есть" : "нет", facts.hasPhone),
    evidence("Email", facts.hasEmail ? facts.email || "есть" : "нет", facts.hasEmail),
    evidence("Формы", facts.forms, facts.forms > 0),
    evidence("Онлайн-запись", facts.hasBooking ? "есть" : "нет", facts.hasBooking),
    evidence("Отзывы/доверие", facts.hasReviews ? "есть" : "слабо", facts.hasReviews),
    evidence("Карта/адрес", facts.hasMaps ? "есть" : "нет", facts.hasMaps),
    evidence("Schema", facts.hasSchema ? "есть" : "нет", facts.hasSchema),
    evidence("Analytics", facts.hasAnalytics ? "есть" : "не найдено", facts.hasAnalytics),
    evidence("Alt у фото", `${Math.round(facts.imageAltRatio || 0)}%`, facts.imageAltRatio >= 60),
    evidence("Загрузка", facts.loadMs ? `${facts.loadMs} ms` : "нет данных", facts.loadMs > 0 && facts.loadMs < 2600)
  ];
}

function buildOutreach(input, facts, priorities, money) {
  const top = priorities[0];
  const host = facts.host;
  const business = inferBusinessName(facts, input);
  const monthly = formatUsd(money.monthlyOpportunity);
  const firstFix = top?.fix || "быстро усилить путь к заявке";

  const email = `Hi ${business} team,\n\nI ran a quick conversion audit of ${host}. One thing stood out: ${top.title.toLowerCase()}.\n\nThis usually means visitors can like the business but still leave before sending a request. Based on your current signals, I would frame the opportunity around roughly ${monthly}/month in recoverable lead value. Not a guarantee, just a practical sales estimate.\n\nI can fix the first layer fast: ${firstFix}\n\nIf useful, I can send a 1-page report and a fixed-price quick sprint.`;

  const followUp = `Quick follow-up on ${host}: the main issue is still ${top.title.toLowerCase()}. I can package the fix as a small sprint so there is no long redesign process. First step would be: ${firstFix}`;

  const dm = `Quick note: I checked ${host} and found a clear lead-capture gap: ${top.title.toLowerCase()}. I made a short fix plan that could recover about ${monthly}/mo in lead value. Want me to send it?`;

  const telegram = `Аудит ${host}: главный рычаг - ${top.title}. Потенциал разговора: ${monthly}/мес. Первый продаваемый фикс: ${firstFix}`;

  return { email, followUp, dm, telegram };
}

function buildPackage(input, priorities, money) {
  const base = Math.max(290, Math.round(input.averageSale * 0.9));
  const sprint = Math.max(850, Math.round(input.averageSale * 2.4));
  const autopilot = Math.max(1450, Math.round(input.averageSale * 3.8));

  return {
    headline: "Пакет на продажу",
    suggestedAnchor: formatUsd(sprint),
    tiers: [
      {
        name: "Quick Fix",
        price: roundPrice(base),
        scope: "CTA, контакт, форма, базовая доверительная секция",
        delivery: "24-48 часов"
      },
      {
        name: "Conversion Sprint",
        price: roundPrice(sprint),
        scope: `${Math.min(5, priorities.length)} приоритетных правок + отчет до/после`,
        delivery: "3-5 дней"
      },
      {
        name: "Lead Autopilot",
        price: roundPrice(autopilot),
        scope: "Форма, follow-up, tracking, CRM-таблица и еженедельный отчет",
        delivery: "7 дней"
      }
    ],
    objectionHandler: `Не продавай “дизайн”. Продавай ${formatUsd(money.monthlyOpportunity)} потенциальной утечки и маленький первый спринт.`
  };
}

function buildAutomationPlan(input, facts, priorities) {
  const steps = [
    {
      label: "Fetch",
      status: facts.fetchError ? "warning" : "done",
      detail: facts.fetchError || `Получен HTML: ${facts.status || "ok"}`
    },
    {
      label: "Signals",
      status: "done",
      detail: `${facts.ctaCount} CTA, ${facts.forms} форм, ${facts.linksCount} ссылок`
    },
    {
      label: "Money rank",
      status: "done",
      detail: `${priorities.length} продаваемых правок отсортировано по влиянию`
    },
    {
      label: "CRM",
      status: input.createCrmTasks ? "done" : "idle",
      detail: input.createCrmTasks ? "Следующее действие создано" : "Создание задач выключено"
    },
    {
      label: "Export",
      status: input.autoExport ? "done" : "idle",
      detail: input.autoExport ? "Готово к выгрузке" : "Ручной экспорт"
    }
  ];

  return {
    mode: input.mode,
    autopilot: input.autopilot,
    steps
  };
}

function buildCrmPlan(input, facts, priorities, money) {
  const host = facts.host;
  const nextAction = priorities[0]?.title
    ? `Отправить owner message: ${priorities[0].title}`
    : "Отправить короткий отчет";

  return {
    lead: host,
    status: "Новый",
    value: roundPrice(Math.max(input.averageSale * 2, money.monthlyOpportunity * 0.18)),
    nextAction,
    followUpInHours: 48,
    tags: [input.niche, input.city, priorities[0]?.key || "growth"].filter(Boolean)
  };
}

function buildNextActions(input, facts, priorities) {
  return [
    `Скопировать сообщение для ${facts.host}`,
    `Предложить ${priorities[0]?.title || "первый фикс"} как быстрый платный шаг`,
    "Через 48 часов отправить follow-up, если нет ответа",
    "После ответа отправить HTML отчет и фиксированную цену"
  ];
}

function priority(key, title, severity, moneyWeight, sellLine, fix) {
  return { key, title, severity, moneyWeight, sellLine, fix };
}

function evidence(label, value, good) {
  return { label, value, good: Boolean(good) };
}

function inferBusinessName(facts, input) {
  const title = String(facts.title || "").split("|")[0].split("-")[0].trim();
  if (title && title.length <= 55) return title;
  if (facts.host) return facts.host.replace(/^www\./, "");
  return input.niche || "business";
}

function scoreGrade(score) {
  if (score >= 86) return "A";
  if (score >= 72) return "B";
  if (score >= 56) return "C";
  if (score >= 40) return "D";
  return "F";
}

function scoreLabel(score) {
  if (score >= 86) return "Готов к росту";
  if (score >= 72) return "Есть что усилить";
  if (score >= 56) return "Есть деньги в правках";
  if (score >= 40) return "Сильная утечка лидов";
  return "Нужен быстрый rescue";
}

function points(rows) {
  return rows.reduce((sum, [condition, amount]) => sum + (condition ? amount : 0), 0);
}

function textIncludes(facts, term) {
  const haystack = `${facts.title || ""} ${facts.metaDescription || ""} ${(facts.h1 || []).join(" ")}`.toLowerCase();
  return haystack.includes(String(term || "").toLowerCase());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function createReportId(host) {
  const cleanHost = String(host || "site").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${cleanHost}-${Date.now().toString(36)}`;
}

function roundPrice(value) {
  return Math.max(99, Math.round(value / 25) * 25);
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function countTextSignals(text) {
  const lower = String(text || "").toLowerCase();
  return {
    ctaTerms: countMatches(lower, CTA_TERMS),
    localTerms: countMatches(lower, LOCAL_TERMS),
    trustTerms: countMatches(lower, TRUST_TERMS)
  };
}

function countMatches(text, terms) {
  return terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
}
