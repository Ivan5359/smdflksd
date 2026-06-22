import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { APP_VERSION } from "./lib/auditEngine.js";
import { demoReport } from "./sampleAudit.js";
import "./styles.css";

function AppIcon({ size = 18, className = "", strokeWidth = 2, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 3.75 19.2 7.9v8.2L12 20.25l-7.2-4.15V7.9L12 3.75Z" />
      <path d="M8.5 12.4 11 14.9l4.7-5.6" />
      <path d="M12 3.75v4.1" />
    </svg>
  );
}

const Activity = AppIcon;
const AlertTriangle = AppIcon;
const ArrowDownToLine = AppIcon;
const BadgeDollarSign = AppIcon;
const BarChart3 = AppIcon;
const Bot = AppIcon;
const Check = AppIcon;
const ChevronRight = AppIcon;
const Clipboard = AppIcon;
const Copy = AppIcon;
const Download = AppIcon;
const ExternalLink = AppIcon;
const FileText = AppIcon;
const History = AppIcon;
const Loader2 = AppIcon;
const Mail = AppIcon;
const Play = AppIcon;
const Plus = AppIcon;
const Printer = AppIcon;
const Radar = AppIcon;
const Search = AppIcon;
const Send = AppIcon;
const ShieldCheck = AppIcon;
const Sparkles = AppIcon;
const Target = AppIcon;
const Trash2 = AppIcon;
const TrendingUp = AppIcon;
const Zap = AppIcon;

const defaultForm = {
  url: "",
  niche: "plumber",
  city: "Austin",
  averageSale: 420,
  monthlyVisitors: 850,
  mode: "agent",
  autopilot: true,
  createCrmTasks: true,
  autoExport: false
};

const defaultQueue = [
  "https://demo-plumbing.example",
  "https://example.com"
].join("\n");

const defaultDiscoveryLocations = [
  "New York, USA",
  "London, United Kingdom",
  "Toronto, Canada",
  "Dubai, UAE"
].join("\n");

const emptyMoneyMachine = { leads: [], pipeline: null, totals: null, searchedLocations: [], jobId: "" };

const nichePresets = [
  { label: "Dentist", niche: "dentist", averageSale: 500, monthlyVisitors: 700 },
  { label: "Clinic", niche: "clinic", averageSale: 650, monthlyVisitors: 900 },
  { label: "Lawyer", niche: "law firm", averageSale: 1200, monthlyVisitors: 600 },
  { label: "HVAC", niche: "hvac", averageSale: 780, monthlyVisitors: 850 },
  { label: "Hotel", niche: "hotel", averageSale: 240, monthlyVisitors: 1600 },
  { label: "Salon", niche: "salon", averageSale: 140, monthlyVisitors: 900 }
];

const locationPresets = [
  {
    label: "USA money",
    worldwide: false,
    city: "Austin",
    locations: ["Austin, USA", "Miami, USA", "Chicago, USA", "Los Angeles, USA", "New York, USA"]
  },
  {
    label: "EU cities",
    worldwide: false,
    city: "Madrid",
    locations: ["Madrid, Spain", "Barcelona, Spain", "Paris, France", "Berlin, Germany", "Amsterdam, Netherlands"]
  },
  {
    label: "Gulf",
    worldwide: false,
    city: "Dubai",
    locations: ["Dubai, UAE", "Doha, Qatar", "Riyadh, Saudi Arabia", "Abu Dhabi, UAE"]
  },
  {
    label: "World scan",
    worldwide: true,
    city: "Austin",
    locations: ["New York, USA", "London, United Kingdom", "Toronto, Canada", "Dubai, UAE", "Singapore"]
  }
];

const messageTabs = [
  { id: "email", label: "Email" },
  { id: "followUp", label: "Follow-up" },
  { id: "dm", label: "DM" },
  { id: "telegram", label: "Telegram" }
];

function App() {
  const [form, setForm] = useState(defaultForm);
  const [queueText, setQueueText] = useState(defaultQueue);
  const [report, setReport] = useState(demoReport);
  const [history, setHistory] = useState(() => readLocal("sitemoney.history", []));
  const [crm, setCrm] = useState(() => readLocal("sitemoney.crm", []));
  const [savedLeads, setSavedLeads] = useState(() => readLocal("sitemoney.savedLeads", []));
  const [bulkResults, setBulkResults] = useState([]);
  const [discoveredBusinesses, setDiscoveredBusinesses] = useState([]);
  const [discoveryLocations, setDiscoveryLocations] = useState(defaultDiscoveryLocations);
  const [discoverySettings, setDiscoverySettings] = useState({
    worldwide: true,
    limit: 30,
    auditLimit: 6,
    locationLimit: 5,
    radiusKm: 14,
    requireWebsite: false
  });
  const [moneySettings, setMoneySettings] = useState({
    maxLeads: 30,
    minMoneyScore: 45,
    monthlyRetainer: 180,
    closeRate: 12
  });
  const [moneyMachine, setMoneyMachine] = useState(() => readInitialMoneyMachine());
  const [backgroundJob, setBackgroundJob] = useState(() => readInitialBackgroundJob());
  const [leadFilter, setLeadFilter] = useState({
    query: "",
    onlyWebsite: false,
    onlySaved: false,
    minScore: 0,
    sort: "money"
  });
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [messageTab, setMessageTab] = useState("email");
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [moneyLoading, setMoneyLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [serverVersion, setServerVersion] = useState(APP_VERSION);

  useEffect(() => {
    fetch("/__version")
      .then((response) => response.json())
      .then((payload) => setServerVersion(payload.version || APP_VERSION))
      .catch(() => setServerVersion(APP_VERSION));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreLatestJob() {
      try {
        const response = await fetch("/api/jobs/latest?type=lead-machine", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;
        if (!isCurrentJob(payload.job)) {
          clearBackgroundJob();
          resetMoneyMachine();
          return;
        }
        rememberBackgroundJob(payload.job);
        const active = ["queued", "running"].includes(payload.job.status);
        setMoneyLoading(active);
        if (payload.job.status === "completed" && payload.job.result) {
          applyMoneyMachineData(payload.job.result, payload.job, false);
        }
      } catch {
        // The site still works as a local saved dashboard if the server job endpoint is not ready yet.
      }
    }
    restoreLatestJob();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!backgroundJob?.id || !["queued", "running"].includes(backgroundJob.status)) return undefined;
    let cancelled = false;
    const poll = () => {
      if (!cancelled) syncBackgroundJob(backgroundJob.id, true);
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [backgroundJob?.id, backgroundJob?.status]);

  useEffect(() => {
    const scrollToHash = () => {
      const targetId = window.location.hash.replace("#", "");
      if (!targetId) return;
      window.setTimeout(() => {
        document.getElementById(decodeURIComponent(targetId))?.scrollIntoView({ block: "start" });
      }, 80);
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  const queueUrls = useMemo(
    () =>
      queueText
        .split(/\r?\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean),
    [queueText]
  );

  const sortedBulk = useMemo(
    () =>
      bulkResults
        .filter((item) => item.ok)
        .map((item) => item.report)
        .sort((a, b) => b.money.monthlyOpportunity - a.money.monthlyOpportunity),
    [bulkResults]
  );

  const rankedDiscovery = useMemo(
    () =>
      [...discoveredBusinesses].sort((a, b) => {
        if ((b.moneyOpportunity || 0) !== (a.moneyOpportunity || 0)) {
          return (b.moneyOpportunity || 0) - (a.moneyOpportunity || 0);
        }
        return (b.score || 0) - (a.score || 0);
      }),
    [discoveredBusinesses]
  );

  const savedLeadIds = useMemo(() => new Set(savedLeads.map((lead) => lead.id)), [savedLeads]);

  const filteredDiscovery = useMemo(() => {
    const query = leadFilter.query.trim().toLowerCase();
    const filtered = rankedDiscovery.filter((business) => {
      const normalized = normalizeLead(business);
      const haystack = `${normalized.name || ""} ${normalized.city || ""} ${normalized.country || ""} ${normalized.website || ""} ${normalized.topPriority || ""}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (leadFilter.onlyWebsite && !getLeadLinks(normalized).website) return false;
      if (leadFilter.onlySaved && !savedLeadIds.has(normalized.id)) return false;
      if ((normalized.score || 0) < Number(leadFilter.minScore || 0)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (leadFilter.sort === "score") return (b.score || 0) - (a.score || 0);
      if (leadFilter.sort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      return (b.moneyOpportunity || 0) - (a.moneyOpportunity || 0) || (b.score || 0) - (a.score || 0);
    });
  }, [leadFilter, rankedDiscovery, savedLeadIds]);

  const pipelineStats = useMemo(() => {
    const leads = (rankedDiscovery.length ? rankedDiscovery : savedLeads).map(normalizeLead);
    const total = leads.length;
    const withWebsite = leads.filter((lead) => getLeadLinks(lead).website).length;
    const highScore = leads.filter((lead) => (lead.score || 0) >= 75).length;
    return [
      { label: "Найдено", value: total },
      { label: "С сайтами", value: withWebsite },
      { label: "Сохранено", value: savedLeads.length },
      { label: "CRM", value: crm.length },
      { label: "75+", value: highScore }
    ];
  }, [crm.length, rankedDiscovery, savedLeads]);

  const moneyLeads = useMemo(() => (moneyMachine.leads || []).map(normalizeLead), [moneyMachine]);
  const moneyPipeline = moneyMachine.pipeline || {};
  const activeBackgroundJob = Boolean(backgroundJob && ["queued", "running"].includes(backgroundJob.status));
  const backgroundProgress = backgroundJob?.progress || {};
  const backgroundPercent = Math.min(100, Math.max(0, Number(backgroundProgress.percent || 0)));
  const moneyMachineBusy = moneyLoading || activeBackgroundJob;
  const hotMoneyLeads = moneyLeads.filter((lead) => lead.priority === "hot").length;
  const selectedMoneyLead = useMemo(
    () => moneyLeads.find((lead) => lead.id === selectedLeadId) || moneyLeads[0] || null,
    [moneyLeads, selectedLeadId]
  );
  const selectedLeadLinks = selectedMoneyLead ? getLeadLinks(selectedMoneyLead) : {};
  const expectedPipelineRevenue = Math.round(
    ((Number(moneyPipeline.oneTimeValue || 0) + Number(moneyPipeline.monthlyValue || 0) * 3) *
      Number(moneySettings.closeRate || 0)) /
      100
  );
  const outreachPackCount = moneyLeads.length ? moneyLeads.length : filteredDiscovery.length;

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDiscovery(key, value) {
    setDiscoverySettings((current) => ({ ...current, [key]: value }));
  }

  function updateLeadFilter(key, value) {
    setLeadFilter((current) => ({ ...current, [key]: value }));
  }

  function updateMoneySettings(key, value) {
    setMoneySettings((current) => ({ ...current, [key]: value }));
  }

  function applyNichePreset(preset) {
    setForm((current) => ({
      ...current,
      niche: preset.niche,
      averageSale: preset.averageSale,
      monthlyVisitors: preset.monthlyVisitors,
      mode: "agent",
      autopilot: true,
      createCrmTasks: true
    }));
  }

  function applyLocationPreset(preset) {
    setForm((current) => ({ ...current, city: preset.city }));
    setDiscoveryLocations(preset.locations.join("\n"));
    setDiscoverySettings((current) => ({
      ...current,
      worldwide: preset.worldwide,
      locationLimit: Math.min(8, preset.locations.length),
      radiusKm: preset.worldwide ? 14 : 12
    }));
  }

  async function runAudit(event, override = {}) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setCopied("");

    try {
      const payload = { ...form, ...override };
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Audit failed");
      acceptReport(data, true);
    } catch (auditError) {
      setError(auditError.message || "Не удалось выполнить аудит.");
    } finally {
      setLoading(false);
    }
  }

  async function runQueue() {
    setQueueLoading(true);
    setError("");
    setCopied("");

    try {
      const response = await fetch("/api/bulk-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, urls: queueUrls })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Queue failed");
      setBulkResults(data.reports || []);
      const firstReport = data.reports?.find((item) => item.ok)?.report;
      if (firstReport) acceptReport(firstReport, true);
      if (form.createCrmTasks) {
        const newTasks = (data.reports || [])
          .filter((item) => item.ok)
          .map((item) => crmFromReport(item.report));
        const next = mergeCrm(newTasks, crm);
        setCrm(next);
        writeLocal("sitemoney.crm", next);
      }
    } catch (queueError) {
      setError(queueError.message || "Не удалось запустить очередь.");
    } finally {
      setQueueLoading(false);
    }
  }

  async function runDiscovery() {
    setDiscoverLoading(true);
    setError("");
    setCopied("");

    try {
      const response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...discoverySettings,
          locations: discoveryLocations,
          auditFound: true
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Discovery failed");

      setDiscoveredBusinesses(data.businesses || []);
      const reportItems = (data.reports || []).map((item) => ({ ok: true, report: item }));
      setBulkResults(reportItems);
      const firstReport = data.reports?.[0];
      if (firstReport) acceptReport(firstReport, true);

      if (form.createCrmTasks && data.reports?.length) {
        const newTasks = data.reports.map((item) => crmFromReport(item));
        const next = mergeCrm(newTasks, crm);
        setCrm(next);
        writeLocal("sitemoney.crm", next);
      }

      const savable = (data.businesses || []).slice(0, 8);
      if (savable.length) {
        const nextSaved = mergeLeads(savable, savedLeads);
        setSavedLeads(nextSaved);
        writeLocal("sitemoney.savedLeads", nextSaved);
      }

      setCopied("discovery");
      window.setTimeout(() => setCopied(""), 1600);
    } catch (discoverError) {
      setError(discoverError.message || "Не удалось найти бизнесы.");
    } finally {
      setDiscoverLoading(false);
    }
  }

  function rememberBackgroundJob(job) {
    if (!isCurrentJob(job)) {
      clearBackgroundJob();
      return;
    }
    setBackgroundJob(job);
    writeLocal("sitemoney.backgroundJob", job);
  }

  function clearBackgroundJob() {
    setBackgroundJob(null);
    removeLocal("sitemoney.backgroundJob");
  }

  function resetMoneyMachine() {
    setMoneyMachine(emptyMoneyMachine);
    setDiscoveredBusinesses([]);
    removeLocal("sitemoney.moneyMachine");
  }

  function applyMoneyMachineData(data, sourceJob = null, notify = true) {
    if (!data) return;
    if (!isCurrentMoneyMachineData(data)) {
      resetMoneyMachine();
      return;
    }
    const nextMachine = {
      ...data,
      jobId: sourceJob?.id || data.jobId || ""
    };
    setMoneyMachine(nextMachine);
    writeLocal("sitemoney.moneyMachine", nextMachine);
    setDiscoveredBusinesses(data.leads || []);

    const normalizedLeads = (data.leads || []).map(normalizeLead);
    if (normalizedLeads.length) setSelectedLeadId(normalizedLeads[0].id);

    const reportItems = (data.reports || []).map((item) => ({ ok: true, report: item }));
    setBulkResults(reportItems);
    const firstReport = data.reports?.[0];
    if (firstReport) acceptReport(firstReport, true);

    if (form.createCrmTasks && data.leads?.length) {
      const newTasks = data.leads.slice(0, 12).map((item) => crmFromBusiness(item));
      setCrm((current) => {
        const next = mergeCrm(newTasks, current);
        writeLocal("sitemoney.crm", next);
        return next;
      });
    }

    if (data.leads?.length) {
      setSavedLeads((current) => {
        const next = mergeLeads(data.leads.slice(0, 12), current);
        writeLocal("sitemoney.savedLeads", next);
        return next;
      });
    }

    if (notify) {
      setCopied("money-machine");
      window.setTimeout(() => setCopied(""), 1600);
    }
  }

  async function syncBackgroundJob(jobId = backgroundJob?.id, silent = false) {
    if (!jobId) return;
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          clearBackgroundJob();
          resetMoneyMachine();
          return;
        }
        throw new Error(payload.error || "Job status failed");
      }
      const job = payload.job;
      if (!isCurrentJob(job)) {
        clearBackgroundJob();
        resetMoneyMachine();
        return;
      }
      rememberBackgroundJob(job);
      const active = ["queued", "running"].includes(job.status);
      setMoneyLoading(active);
      if (job.status === "completed" && job.result) {
        applyMoneyMachineData(job.result, job, !silent);
      }
      if (job.status === "failed") {
        setError(job.error || "Фоновый скан завершился ошибкой.");
      }
    } catch (jobError) {
      if (!silent) setError(jobError.message || "Не удалось обновить серверный job.");
      setMoneyLoading(false);
    }
  }

  async function runMoneyMachine() {
    setMoneyLoading(true);
    setError("");
    setCopied("");

    try {
      const response = await fetch("/api/lead-machine/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...discoverySettings,
          ...moneySettings,
          locations: discoveryLocations,
          auditFound: true
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Money machine failed");

      rememberBackgroundJob(data.job);
      setCopied("background-scan");
      window.setTimeout(() => setCopied(""), 1600);
    } catch (machineError) {
      setMoneyLoading(false);
      setError(machineError.message || "Не удалось запустить money machine.");
    }
  }

  function acceptReport(nextReport, persist) {
    setReport(nextReport);
    if (!persist) return;
    const nextHistory = [
      {
        id: nextReport.id,
        url: nextReport.input.url,
        host: nextReport.host,
        score: nextReport.score.total,
        money: nextReport.money.monthlyOpportunity,
        createdAt: nextReport.createdAt,
        report: nextReport
      },
      ...history.filter((item) => item.id !== nextReport.id)
    ].slice(0, 12);
    setHistory(nextHistory);
    writeLocal("sitemoney.history", nextHistory);
  }

  function loadDemo() {
    const next = {
      ...demoReport,
      id: `demo-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString()
    };
    acceptReport(next, false);
    setError("");
  }

  function addCurrentToQueue() {
    if (!form.url.trim()) return;
    setQueueText((current) => `${current.trim()}\n${form.url.trim()}`.trim());
  }

  function addCrmTask() {
    const task = crmFromReport(report);
    const next = mergeCrm([task], crm);
    setCrm(next);
    writeLocal("sitemoney.crm", next);
    setCopied("crm");
    window.setTimeout(() => setCopied(""), 1400);
  }

  function saveBusinessLead(business) {
    const next = mergeLeads([business], savedLeads);
    setSavedLeads(next);
    writeLocal("sitemoney.savedLeads", next);
    setCopied(`save-${business.id}`);
    window.setTimeout(() => setCopied(""), 1400);
  }

  function removeSavedLead(id) {
    const next = savedLeads.filter((lead) => lead.id !== id);
    setSavedLeads(next);
    writeLocal("sitemoney.savedLeads", next);
  }

  function addBusinessToCrm(business) {
    const task = crmFromBusiness(business);
    const next = mergeCrm([task], crm);
    setCrm(next);
    writeLocal("sitemoney.crm", next);
    setCopied(`crm-${business.id}`);
    window.setTimeout(() => setCopied(""), 1400);
  }

  function addFilteredWebsitesToQueue() {
    const websites = filteredDiscovery.map((lead) => getLeadLinks(lead).website).filter(Boolean);
    if (!websites.length) return;
    setQueueText((current) => mergeLines(current, websites).join("\n"));
    setCopied("queue");
    window.setTimeout(() => setCopied(""), 1400);
  }

  function selectLead(lead) {
    const normalized = normalizeLead(lead);
    setSelectedLeadId(normalized.id);
  }

  function openLeadAction(lead, target = "best") {
    const links = getLeadLinks(lead);
    const url = links[target] || links.best;
    if (!url) {
      setError("У этого лида нет рабочей ссылки. Используй Google поиск или скопируй бриф для ручной проверки.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function auditLeadWebsite(lead) {
    const normalized = normalizeLead(lead);
    const links = getLeadLinks(normalized);
    selectLead(normalized);
    if (!links.website) {
      setError("У лида нет сайта. Открой карту или Google поиск, найди сайт/телефон и сохрани контакт вручную.");
      return;
    }
    await runAudit(null, {
      url: links.website,
      niche: normalized.niche || form.niche,
      city: normalized.city || form.city,
      averageSale: form.averageSale,
      monthlyVisitors: form.monthlyVisitors,
      mode: "agent",
      autopilot: true,
      createCrmTasks: true
    });
  }

  async function copyLeadDossier(lead) {
    await copyText(`dossier-${normalizeLead(lead).id}`, buildLeadDossier(lead));
  }

  function downloadOutreachPack() {
    const source = moneyLeads.length ? moneyLeads : filteredDiscovery.map(normalizeLead);
    if (!source.length) return;
    const body = source
      .slice(0, 25)
      .map((lead, index) => buildLeadDossier({ ...lead, rank: lead.rank || index + 1 }))
      .join("\n\n---\n\n");
    downloadBlob(new Blob([body], { type: "text/plain;charset=utf-8" }), "sitemoney-outreach-pack.txt");
    setCopied("outreach-pack");
    window.setTimeout(() => setCopied(""), 1400);
  }

  function downloadLeadsCsv() {
    const source = filteredDiscovery.length ? filteredDiscovery : savedLeads;
    const rows = [
      ["name", "city", "country", "website", "phone", "email", "score", "money_score", "priority", "offer", "deal_value", "money_opportunity", "top_priority", "pitch", "map", "best_url", "search_url", "next_steps"],
      ...source.map((lead) => {
        const normalized = normalizeLead(lead);
        const links = getLeadLinks(normalized);
        return [
          normalized.name,
          normalized.city,
          normalized.country,
          normalized.website,
          normalized.phone,
          normalized.email,
          normalized.score,
          normalized.moneyScore,
          normalized.priority,
          normalized.serviceOffer?.name,
          normalized.estimatedDealValue,
          normalized.moneyOpportunity,
          normalized.topPriority,
          normalized.pitch,
          normalized.osmUrl || normalized.mapUrl,
          links.best,
          links.search,
          (normalized.nextSteps || []).join(" | ")
        ];
      })
    ];
    downloadBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), "sitemoney-leads.csv");
  }

  function downloadMoneyCsv() {
    const rows = [
      ["rank", "name", "city", "country", "contact_route", "website", "phone", "email", "money_score", "priority", "opportunity", "offer", "price", "monthly", "client_opportunity", "recommended_action", "best_url", "search_url", "pitch", "next_steps"],
      ...moneyLeads.map((lead) => {
        const links = getLeadLinks(lead);
        return [
          lead.rank,
          lead.name,
          lead.city,
          lead.country,
          lead.contactRoute,
          lead.website,
          lead.phone,
          lead.email,
          lead.moneyScore,
          lead.priority,
          lead.opportunity,
          lead.serviceOffer?.name,
          lead.serviceOffer?.price,
          lead.serviceOffer?.monthly,
          lead.clientOpportunity,
          lead.recommendedAction,
          links.best,
          links.search,
          lead.pitch,
          (lead.nextSteps || []).join(" | ")
        ];
      })
    ];
    downloadBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), "sitemoney-money-machine.csv");
  }

  function downloadCrmCsv() {
    const rows = [
      ["host", "status", "value", "next_action", "follow_up_hours", "tags"],
      ...crm.map((item) => [item.host, item.status, item.value, item.nextAction, item.followUpInHours, (item.tags || []).join("; ")])
    ];
    downloadBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), "sitemoney-crm.csv");
  }

  async function copyLeadBrief(business) {
    const normalized = normalizeLead(business);
    const ownerEmail = ownerEmailForLead(normalized);
    if (ownerEmail) {
      await copyText(`lead-${normalized.id}`, ownerEmail);
      return;
    }
    const text = [
      `${normalized.name}`,
      [normalized.city, normalized.country].filter(Boolean).join(", "),
      normalized.website ? `Site: ${normalized.website}` : "Site: not found",
      normalized.websiteReachable === false ? `Website problem: ${normalized.websiteProblem || `HTTP ${normalized.websiteStatus}`}` : "",
      normalized.phone ? `Phone: ${normalized.phone}` : "",
      normalized.email ? `Email: ${normalized.email}` : "",
      `Score: ${normalized.score || 0}`,
      `Hook: ${normalized.topPriority || "Нужен аудит"}`
    ]
      .filter(Boolean)
      .join("\n");
    await copyText(`lead-${normalized.id}`, text);
  }

  function updateCrmStatus(id, status) {
    const next = crm.map((item) => (item.id === id ? { ...item, status } : item));
    setCrm(next);
    writeLocal("sitemoney.crm", next);
  }

  function clearHistory() {
    setHistory([]);
    writeLocal("sitemoney.history", []);
  }

  function clearCrm() {
    setCrm([]);
    writeLocal("sitemoney.crm", []);
  }

  async function copyText(label, value) {
    const text = String(value || "");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copiedOk = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copiedOk) throw new Error("Copy command failed");
        setCopied(label);
        window.setTimeout(() => setCopied(""), 1400);
      } catch {
        setError("Браузер не дал доступ к clipboard. Используй TXT pack, CSV или выдели текст вручную.");
      }
    }
  }

  function downloadJson() {
    downloadBlob(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      `sitemoney-audit-${report.id}.json`
    );
  }

  function downloadCsv() {
    const rows = [
      ["host", "score", "money_opportunity", "top_priority", "package", "next_action"],
      [
        report.host,
        report.score.total,
        report.money.monthlyOpportunity,
        report.priorities[0]?.title || "",
        report.package.suggestedAnchor,
        report.crm.nextAction
      ]
    ];
    downloadBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), `sitemoney-${report.id}.csv`);
  }

  function downloadHtml() {
    downloadBlob(
      new Blob([buildReportHtml(report)], { type: "text/html;charset=utf-8" }),
      `sitemoney-report-${report.id}.html`
    );
  }

  const activeMessage = report.outreach[messageTab] || report.outreach.email;
  const topPriority = report.priorities[0];
  const radarTargets = filteredDiscovery.length
    ? filteredDiscovery.slice(0, 6)
    : sortedBulk.slice(0, 6).map((item) => ({
        id: item.id,
        name: item.businessName || item.host,
        city: item.input?.city || form.city,
        country: "",
        website: item.finalUrl || item.input.url,
        osmUrl: item.finalUrl || item.input.url,
        score: item.score.total,
        moneyOpportunity: item.money.monthlyOpportunity,
        topPriority: item.priorities?.[0]?.title || "Готов к продаже"
      }));
  const radarFeed = radarTargets.length ? radarTargets : [
    {
      id: "demo-radar",
      name: report.businessName || report.host,
      city: form.city,
      country: "",
      website: report.finalUrl || report.input.url,
      osmUrl: report.finalUrl || report.input.url,
      score: report.score.total,
      moneyOpportunity: report.money.monthlyOpportunity,
      topPriority: topPriority?.title || "Ждет поиска"
    }
  ];

  return (
    <div className="app-shell command-center">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Radar size={22} />
          </div>
          <div>
            <h1>SiteMoney Audit</h1>
            <span>{serverVersion}</span>
          </div>
        </div>
        <nav className="command-tabs" aria-label="Рабочие зоны">
          <a href="#automation">Автопилот</a>
          <a href="#money-machine">Money Machine</a>
          <a href="#radar">Радар целей</a>
          <a href="#deal">Сделка</a>
          <a href="#export">Экспорт</a>
        </nav>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={loadDemo}>
            <Sparkles size={16} />
            Демо
          </button>
          <button className="primary-button" onClick={runDiscovery} disabled={discoverLoading}>
            {discoverLoading ? <Loader2 className="spin" size={16} /> : <Radar size={16} />}
            Найти бизнесы
          </button>
          <button className="primary-button" onClick={runMoneyMachine} disabled={moneyMachineBusy}>
            {moneyMachineBusy ? <Loader2 className="spin" size={16} /> : <BadgeDollarSign size={16} />}
            Money Machine
          </button>
        </div>
      </header>

      <main className="mission-grid">
        <aside className="launch-column" id="automation">
          <section className="control-slab">
            <div className="slab-kicker">01 / CONTROL</div>
            <SectionTitle icon={<Bot size={18} />} title="Автопилот" />
            <form className="audit-form" onSubmit={(event) => runAudit(event)}>
              <label>
                URL для фокуса
                <div className="input-with-action">
                  <input
                    type="url"
                    placeholder="https://business.com"
                    value={form.url}
                    onChange={(event) => updateForm("url", event.target.value)}
                  />
                  <button type="button" onClick={addCurrentToQueue} aria-label="Добавить URL в очередь">
                    <Plus size={16} />
                  </button>
                </div>
              </label>

              <div className="split-fields">
                <label>
                  Ниша
                  <input value={form.niche} onChange={(event) => updateForm("niche", event.target.value)} />
                </label>
                <label>
                  Город
                  <input value={form.city} onChange={(event) => updateForm("city", event.target.value)} />
                </label>
              </div>

              <div className="split-fields">
                <label>
                  Средний чек
                  <input
                    type="number"
                    min="1"
                    value={form.averageSale}
                    onChange={(event) => updateForm("averageSale", event.target.value)}
                  />
                </label>
                <label>
                  Визиты/мес
                  <input
                    type="number"
                    min="1"
                    value={form.monthlyVisitors}
                    onChange={(event) => updateForm("monthlyVisitors", event.target.value)}
                  />
                </label>
              </div>

              <div className="preset-bank">
                {nichePresets.map((preset) => (
                  <button type="button" key={preset.label} onClick={() => applyNichePreset(preset)}>
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="segmented">
                {["fast", "deep", "agent"].map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={form.mode === mode ? "active" : ""}
                    onClick={() => updateForm("mode", mode)}
                  >
                    {mode === "fast" ? "Быстро" : mode === "deep" ? "Глубоко" : "Агент"}
                  </button>
                ))}
              </div>

              <div className="toggle-grid">
                <Toggle
                  label="CRM задачи"
                  checked={form.createCrmTasks}
                  onChange={(value) => updateForm("createCrmTasks", value)}
                />
                <Toggle
                  label="Автоэкспорт"
                  checked={form.autoExport}
                  onChange={(value) => updateForm("autoExport", value)}
                />
                <Toggle
                  label="Автопилот"
                  checked={form.autopilot}
                  onChange={(value) => updateForm("autopilot", value)}
                />
              </div>

              <button className="primary-button wide" type="submit" disabled={loading}>
                {loading ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
                Аудит URL
              </button>
            </form>
          </section>

          <section className="control-slab discovery-slab">
            <div className="panel-head">
              <div>
                <span>Глобальный поиск</span>
                <strong>{discoverySettings.worldwide ? "WORLD" : "CUSTOM"}</strong>
              </div>
              <Bot size={16} />
            </div>
            <div className="preset-bank geo-bank">
              {locationPresets.map((preset) => (
                <button type="button" key={preset.label} onClick={() => applyLocationPreset(preset)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="toggle-grid compact">
              <Toggle
                label="Искать по миру"
                checked={discoverySettings.worldwide}
                onChange={(value) => updateDiscovery("worldwide", value)}
              />
              <Toggle
                label="Только с сайтом"
                checked={discoverySettings.requireWebsite}
                onChange={(value) => updateDiscovery("requireWebsite", value)}
              />
            </div>
            <div className="split-fields discovery-numbers">
              <label>
                Найти
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={discoverySettings.limit}
                  onChange={(event) => updateDiscovery("limit", event.target.value)}
                />
              </label>
              <label>
                Аудит
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={discoverySettings.auditLimit}
                  onChange={(event) => updateDiscovery("auditLimit", event.target.value)}
                />
              </label>
            </div>
            <div className="split-fields discovery-numbers">
              <label>
                Городов
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={discoverySettings.locationLimit}
                  onChange={(event) => updateDiscovery("locationLimit", event.target.value)}
                />
              </label>
              <label>
                Радиус км
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={discoverySettings.radiusKm}
                  onChange={(event) => updateDiscovery("radiusKm", event.target.value)}
                />
              </label>
            </div>
            <label className="locations-box">
              Локации
              <textarea
                value={discoveryLocations}
                onChange={(event) => setDiscoveryLocations(event.target.value)}
                spellCheck="false"
              />
            </label>
            <button className="primary-button wide" onClick={runDiscovery} disabled={discoverLoading}>
              {discoverLoading ? <Loader2 className="spin" size={16} /> : <Radar size={16} />}
              Найти бизнесы
            </button>
          </section>

          <section className="control-slab money-control">
            <div className="panel-head">
              <div>
                <span>Money Machine</span>
                <strong>{hotMoneyLeads} hot</strong>
              </div>
              <BadgeDollarSign size={16} />
            </div>
            <div className="split-fields discovery-numbers">
              <label>
                Лидов
                <input
                  type="number"
                  min="5"
                  max="80"
                  value={moneySettings.maxLeads}
                  onChange={(event) => updateMoneySettings("maxLeads", event.target.value)}
                />
              </label>
              <label>
                Min score
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={moneySettings.minMoneyScore}
                  onChange={(event) => updateMoneySettings("minMoneyScore", event.target.value)}
                />
              </label>
            </div>
            <div className="split-fields discovery-numbers">
              <label>
                Retainer
                <input
                  type="number"
                  min="0"
                  value={moneySettings.monthlyRetainer}
                  onChange={(event) => updateMoneySettings("monthlyRetainer", event.target.value)}
                />
              </label>
              <label>
                Close %
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={moneySettings.closeRate}
                  onChange={(event) => updateMoneySettings("closeRate", event.target.value)}
                />
              </label>
            </div>
            <button className="primary-button wide" onClick={runMoneyMachine} disabled={moneyMachineBusy}>
              {moneyMachineBusy ? <Loader2 className="spin" size={16} /> : <BadgeDollarSign size={16} />}
              Запустить money machine
            </button>
            {backgroundJob ? (
              <div className={`background-job-card compact ${backgroundJob.status}`}>
                <div className="job-title-row">
                  <span>Фоновый режим</span>
                  <strong>{jobStatusLabel(backgroundJob.status)}</strong>
                </div>
                <p>{backgroundProgress.message || "Серверный job готовит поиск."}</p>
                <div className="job-progress" aria-label="Прогресс фонового скана">
                  <span style={{ width: `${backgroundPercent}%` }} />
                </div>
                <div className="job-meta">
                  <span>Серверный job {shortJobId(backgroundJob.id)}</span>
                  <span>{backgroundPercent}%</span>
                </div>
                <button className="secondary-button wide mini" type="button" onClick={() => syncBackgroundJob(backgroundJob.id)}>
                  Обновить job
                </button>
              </div>
            ) : null}
          </section>

          <section className="control-slab queue-slab">
            <div className="panel-head">
              <div>
                <span>Очередь сайтов</span>
                <strong>{queueUrls.length}</strong>
              </div>
              <button className="icon-button" onClick={() => setQueueText("")} aria-label="Очистить очередь">
                <Trash2 size={15} />
              </button>
            </div>
            <textarea
              value={queueText}
              onChange={(event) => setQueueText(event.target.value)}
              spellCheck="false"
              aria-label="Очередь сайтов"
            />
            <button className="secondary-button wide" onClick={runQueue} disabled={queueLoading || !queueUrls.length}>
              {queueLoading ? <Loader2 className="spin" size={16} /> : <Zap size={16} />}
              Запустить очередь
            </button>
          </section>

          {error ? (
            <div className="error-banner">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}
        </aside>

        <section className="radar-hub" id="radar">
          <div className="radar-header">
            <div>
              <span>02 / TARGET RADAR</span>
              <h2>Радар целей</h2>
            </div>
            <div className="mission-status">
              <strong>{radarFeed.length}</strong>
              <span>целей в фокусе</span>
            </div>
          </div>

          <div className="radar-card">
            <div className="radar-visual" aria-label="Карта найденных бизнесов">
              <div className="radar-sweep" />
              <div className="radar-core">
                <strong>{report.score.total}</strong>
                <span>{report.score.grade}</span>
              </div>
              {radarFeed.slice(0, 6).map((target, index) => (
                <button
                  type="button"
                  key={target.id}
                  className={`radar-dot dot-${index + 1}`}
                  title={target.name}
                >
                  <span>{target.score || 0}</span>
                </button>
              ))}
            </div>

            <div className="radar-readout">
              <p>Текущий фокус</p>
              <h3>{report.businessName || report.host}</h3>
              <a href={report.finalUrl || report.input.url} target="_blank" rel="noreferrer">
                {report.host}
                <ExternalLink size={14} />
              </a>
              <div className="readout-metrics">
                <MetricBlock
                  icon={<BadgeDollarSign size={18} />}
                  label="Потенциал/мес"
                  value={money(report.money.monthlyOpportunity)}
                  note={`${report.money.extraLeads} доп. лидов`}
                />
                <MetricBlock
                  icon={<Target size={18} />}
                  label="Главный рычаг"
                  value={topPriority?.moneyWeight || 0}
                  note={topPriority?.title || "growth"}
                />
              </div>
            </div>
          </div>

          <section className="pipeline-strip" aria-label="Воронка лидов">
            {pipelineStats.map((item) => (
              <div key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </section>

          <section className="money-machine-panel" id="money-machine">
            <div className="stream-head">
              <SectionTitle icon={<BadgeDollarSign size={18} />} title="Money Machine" inline />
              <div className="stream-actions">
                <button className="secondary-button" onClick={runMoneyMachine} disabled={moneyMachineBusy}>
                  {moneyMachineBusy ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
                  Запуск
                </button>
                <button className="secondary-button" onClick={downloadMoneyCsv} disabled={!moneyLeads.length}>
                  <Download size={15} />
                  CSV money
                </button>
                <button className="secondary-button" onClick={downloadOutreachPack} disabled={!outreachPackCount}>
                  <Clipboard size={15} />
                  TXT pack
                </button>
              </div>
            </div>

            {backgroundJob ? (
              <section className={`background-job-card wide ${backgroundJob.status}`} aria-label="Фоновый режим Money Machine">
                <div className="job-status-grid">
                  <div>
                    <span>Последний скан</span>
                    <strong>{jobStatusLabel(backgroundJob.status)}</strong>
                    <p>{backgroundProgress.message || "Серверный job ожидает обновления."}</p>
                  </div>
                  <div className="job-stat">
                    <b>{backgroundProgress.found || moneyMachine.totals?.found || 0}</b>
                    <span>найдено</span>
                  </div>
                  <div className="job-stat">
                    <b>{backgroundProgress.audited || moneyMachine.totals?.audited || 0}</b>
                    <span>аудит</span>
                  </div>
                  <div className="job-stat">
                    <b>{backgroundProgress.ranked || moneyMachine.totals?.ranked || 0}</b>
                    <span>лиды</span>
                  </div>
                </div>
                <div className="job-progress large" aria-label="Прогресс серверного job">
                  <span style={{ width: `${backgroundPercent}%` }} />
                </div>
                <div className="job-footer">
                  <span>Серверный job {shortJobId(backgroundJob.id)} · {formatJobTime(backgroundJob.updatedAt || backgroundJob.createdAt)}</span>
                  <button className="secondary-button" type="button" onClick={() => syncBackgroundJob(backgroundJob.id)}>
                    Обновить job
                  </button>
                </div>
              </section>
            ) : null}

            <div className="money-summary-grid">
              <MetricBlock
                icon={<Target size={18} />}
                label="Горячие лиды"
                value={moneyPipeline.hot || 0}
                note={`${moneyPipeline.warm || 0} warm`}
              />
              <MetricBlock
                icon={<BadgeDollarSign size={18} />}
                label="Пайплайн услуг"
                value={money(moneyPipeline.oneTimeValue || 0)}
                note={`${money(moneyPipeline.monthlyValue || 0)}/мес retainer`}
              />
              <MetricBlock
                icon={<TrendingUp size={18} />}
                label="Утечка клиентов"
                value={money(moneyPipeline.clientOpportunity || 0)}
                note="оценка для разговора"
              />
              <MetricBlock
                icon={<Zap size={18} />}
                label="Ожидаемый доход"
                value={money(expectedPipelineRevenue)}
                note={`${moneySettings.closeRate}% close rate`}
              />
            </div>

            {selectedMoneyLead ? (
              <section className="lead-workbench" aria-label="Lead Workbench">
                <div className="workbench-main">
                  <div className="workbench-heading">
                    <span>Lead Workbench</span>
                    <h3>{selectedMoneyLead.name}</h3>
                    <p>{[selectedMoneyLead.city, selectedMoneyLead.country].filter(Boolean).join(", ") || selectedMoneyLead.niche}</p>
                  </div>
                  <div className="workbench-score">
                    <strong>{selectedMoneyLead.moneyScore || selectedMoneyLead.score || 0}</strong>
                    <span>{selectedMoneyLead.priority || "lead"}</span>
                  </div>
                </div>

                <div className="contact-matrix">
                  <span className={selectedLeadLinks.website ? "ready" : "missing"}>Сайт</span>
                  <span className={selectedMoneyLead.phone ? "ready" : "missing"}>Телефон</span>
                  <span className={selectedMoneyLead.email ? "ready" : "missing"}>Email</span>
                  <span className={selectedLeadLinks.map || selectedLeadLinks.osm ? "ready" : "missing"}>Карта</span>
                </div>

                <div className="workbench-grid">
                  <div>
                    <b>Лучшее действие</b>
                    <p>{selectedMoneyLead.recommendedAction || moneyPipeline.nextBestAction || "Скопировать питч и проверить контакт"}</p>
                  </div>
                  <div>
                    <b>Оффер</b>
                    <p>
                      {selectedMoneyLead.serviceOffer?.name || "Conversion Sprint"} · {money(selectedMoneyLead.estimatedDealValue || 0)}
                    </p>
                  </div>
                  <div>
                    <b>Почему можно продать</b>
                    <p>{selectedMoneyLead.opportunity || selectedMoneyLead.topPriority || "Есть слабое место в пути к заявке"}</p>
                  </div>
                </div>

                <div className="workbench-actions">
                  <button className="primary-button" type="button" onClick={() => auditLeadWebsite(selectedMoneyLead)} disabled={!selectedLeadLinks.website || loading}>
                    <Search size={15} />
                    Проверить сайт
                  </button>
                  <ActionLink href={selectedLeadLinks.website}>Сайт</ActionLink>
                  <ActionLink href={selectedLeadLinks.map || selectedLeadLinks.osm}>Карта</ActionLink>
                  <ActionLink href={selectedLeadLinks.search}>Google поиск</ActionLink>
                  <ActionLink href={selectedLeadLinks.email}>Email</ActionLink>
                  <ActionLink href={selectedLeadLinks.phone}>Телефон</ActionLink>
                  <button type="button" onClick={() => copyLeadBrief(selectedMoneyLead)}>
                    Питч
                  </button>
                  <button type="button" onClick={() => copyLeadDossier(selectedMoneyLead)}>
                    Бриф
                  </button>
                  <button type="button" onClick={() => addBusinessToCrm(selectedMoneyLead)}>
                    CRM
                  </button>
                </div>

                <div className="workbench-plan">
                  {(selectedMoneyLead.nextSteps?.length ? selectedMoneyLead.nextSteps : buildLeadSteps(selectedMoneyLead)).slice(0, 4).map((step, index) => (
                    <span key={`${selectedMoneyLead.id}-step-${index}`}>{step}</span>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="money-lead-grid">
              {moneyLeads.slice(0, 8).map((lead) => {
                const links = getLeadLinks(lead);
                const isSelected = selectedMoneyLead?.id === lead.id;
                return (
                  <article key={lead.id} className={`money-lead-card ${lead.priority || ""} ${isSelected ? "selected" : ""}`}>
                    <div className="money-card-top">
                      <div className="money-score">
                        <strong>{lead.moneyScore || 0}</strong>
                        <span>{lead.priority || "lead"}</span>
                      </div>
                      <div>
                        <h3>{lead.name}</h3>
                        <p>{[lead.city, lead.country].filter(Boolean).join(", ") || lead.contactRoute}</p>
                      </div>
                    </div>
                    <div className="money-card-meta">
                      <span>{lead.opportunity}</span>
                      <b>{lead.serviceOffer?.name || "Offer"}</b>
                      <strong>{money(lead.estimatedDealValue || 0)}</strong>
                    </div>
                    <p className="pitch-preview">{lead.pitch}</p>
                    <div className="money-evidence">
                      {(lead.evidence || []).slice(0, 3).map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                    <div className="lead-actions money-actions">
                      <button type="button" onClick={() => selectLead(lead)}>
                        {isSelected ? "Выбран" : "План"}
                      </button>
                      <button type="button" onClick={() => auditLeadWebsite(lead)} disabled={!links.website || loading}>
                        Аудит
                      </button>
                      <button type="button" onClick={() => copyLeadBrief(lead)}>
                        Питч
                      </button>
                      <button type="button" onClick={() => addBusinessToCrm(lead)}>
                        CRM
                      </button>
                    </div>
                    <div className="lead-actions money-actions link-actions">
                      <ActionLink href={links.website}>Сайт</ActionLink>
                      <ActionLink href={links.map || links.osm}>Карта</ActionLink>
                      <ActionLink href={links.search}>Поиск</ActionLink>
                      <button type="button" onClick={() => saveBusinessLead(lead)}>
                        {savedLeadIds.has(lead.id) ? "✓" : "Сохр"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {!moneyLeads.length ? (
                <p className="empty-state">Money Machine еще не запускалась. Выбери нишу, гео и нажми запуск.</p>
              ) : null}
            </div>
          </section>

          <section className="target-stream">
            <div className="stream-head">
              <SectionTitle icon={<Bot size={18} />} title="Найденные бизнесы автопилотом" inline />
              <div className="stream-actions">
                <button className="secondary-button" onClick={addFilteredWebsitesToQueue} disabled={!filteredDiscovery.some((lead) => getLeadLinks(lead).website)}>
                  <Plus size={15} />
                  В очередь
                </button>
                <button className="secondary-button" onClick={downloadLeadsCsv} disabled={!filteredDiscovery.length && !savedLeads.length}>
                  <Download size={15} />
                  CSV лиды
                </button>
              </div>
            </div>
            <div className="lead-toolbar">
              <input
                value={leadFilter.query}
                onChange={(event) => updateLeadFilter("query", event.target.value)}
                placeholder="Фильтр по имени, городу, сайту"
              />
              <select value={leadFilter.sort} onChange={(event) => updateLeadFilter("sort", event.target.value)}>
                <option value="money">По деньгам</option>
                <option value="score">По score</option>
                <option value="name">По имени</option>
              </select>
              <select value={leadFilter.minScore} onChange={(event) => updateLeadFilter("minScore", event.target.value)}>
                <option value="0">Все score</option>
                <option value="60">60+</option>
                <option value="75">75+</option>
                <option value="90">90+</option>
              </select>
              <Toggle
                label="С сайтом"
                checked={leadFilter.onlyWebsite}
                onChange={(value) => updateLeadFilter("onlyWebsite", value)}
              />
              <Toggle
                label="Сохраненные"
                checked={leadFilter.onlySaved}
                onChange={(value) => updateLeadFilter("onlySaved", value)}
              />
            </div>
            <div className="stream-list">
              {filteredDiscovery.slice(0, 10).map((business) => {
                const normalized = normalizeLead(business);
                const links = getLeadLinks(normalized);
                return (
                  <article key={normalized.id}>
                    <div className="stream-score">{normalized.score || 0}</div>
                    <div>
                      <strong>{normalized.name}</strong>
                      <span>{[normalized.city, normalized.country].filter(Boolean).join(", ") || normalized.website}</span>
                    </div>
                    <div>
                      <b>{websiteStatusLabel(normalized)}</b>
                      <span>{normalized.topPriority}</span>
                    </div>
                    <ActionLink href={links.website || links.map || links.osm || links.search}>
                      {links.website ? "сайт" : links.map || links.osm ? "карта" : "поиск"}
                    </ActionLink>
                    <div className="lead-actions">
                      <button
                        type="button"
                        onClick={() => saveBusinessLead(normalized)}
                        aria-label={savedLeadIds.has(normalized.id) ? "Лид сохранен" : "Сохранить лид"}
                      >
                        {savedLeadIds.has(normalized.id) ? "✓" : "Сохр"}
                      </button>
                      <button type="button" onClick={() => addBusinessToCrm(normalized)}>
                        CRM
                      </button>
                      <button type="button" onClick={() => copyLeadBrief(normalized)}>
                        Копия
                      </button>
                    </div>
                  </article>
                );
              })}
              {!filteredDiscovery.length ? (
                <p className="empty-state">Пока нет лидов под фильтр. Запусти поиск или снизь ограничения.</p>
              ) : null}
            </div>
          </section>

          <section className="intel-deck" id="audit">
            <div className="category-strip">
              {Object.entries(report.score.categories).map(([key, category]) => (
                <div key={key} className="category-item">
                  <div>
                    <span>{category.label}</span>
                    <strong>{Math.round(category.value)}%</strong>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <i style={{ width: `${category.value}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="intel-grid">
              <section className="priority-zone">
                <SectionTitle icon={<Activity size={18} />} title="Продаваемые правки" inline />
                <div className="priority-list">
                  {report.priorities.slice(0, 5).map((priority, index) => (
                    <article key={`${priority.key}-${index}`} className={`priority-row ${priority.severity}`}>
                      <div className="rank">{index + 1}</div>
                      <div>
                        <div className="row-title">
                          <h3>{priority.title}</h3>
                          <span>{priority.moneyWeight}</span>
                        </div>
                        <p>{priority.sellLine}</p>
                        <small>{priority.fix}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="evidence-zone">
                <SectionTitle icon={<FileText size={18} />} title="Факты из сайта" inline />
                <div className="evidence-table">
                  {report.evidence.slice(0, 10).map((item) => (
                    <div key={item.label} className="evidence-row">
                      <span>{item.label}</span>
                      <strong className={item.good ? "good" : "bad"}>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </section>

        <aside className="deal-drawer" id="deal">
          <section className="drawer-section message-section">
            <div className="slab-kicker">03 / OUTREACH</div>
            <SectionTitle icon={<Mail size={18} />} title="Сообщение" />
            <div className="message-tabs">
              {messageTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={messageTab === tab.id ? "active" : ""}
                  onClick={() => setMessageTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <textarea className="message-box" readOnly value={activeMessage} />
            <button className="primary-button wide" onClick={() => copyText("message", activeMessage)}>
              {copied === "message" ? <Check size={16} /> : <Copy size={16} />}
              Скопировать
            </button>
          </section>

          <section className="drawer-section package-panel">
            <SectionTitle icon={<BadgeDollarSign size={18} />} title="Пакет" inline />
            {report.package.tiers.map((tier) => (
              <div key={tier.name} className="tier-row">
                <div>
                  <strong>{tier.name}</strong>
                  <span>{tier.scope}</span>
                </div>
                <b>{money(tier.price)}</b>
              </div>
            ))}
            <p>{report.package.objectionHandler}</p>
          </section>

          <section className="drawer-section crm-panel" id="crm">
            <div className="panel-head">
              <div>
                <span>CRM</span>
                <strong>{crm.length}</strong>
              </div>
              <button className="icon-button" onClick={clearCrm} aria-label="Очистить CRM">
                <Trash2 size={15} />
              </button>
            </div>
            <button className="secondary-button wide" onClick={addCrmTask}>
              {copied === "crm" ? <Check size={16} /> : <Clipboard size={16} />}
              Добавить задачу
            </button>
            <div className="crm-list">
              {crm.slice(0, 5).map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.host}</strong>
                    <span>{item.nextAction}</span>
                  </div>
                  <select value={item.status} onChange={(event) => updateCrmStatus(item.id, event.target.value)}>
                    <option>Новый</option>
                    <option>Написал</option>
                    <option>Ответил</option>
                    <option>Сделка</option>
                    <option>Пауза</option>
                  </select>
                </article>
              ))}
              {!crm.length ? <p className="empty-state">CRM появится после очереди или кнопки добавления.</p> : null}
            </div>
          </section>

          <section className="drawer-section export-panel" id="export">
            <SectionTitle icon={<ArrowDownToLine size={18} />} title="Экспорт" inline />
            <button className="secondary-button" onClick={downloadHtml}>
              <Download size={16} />
              HTML отчет
            </button>
            <button className="secondary-button" onClick={downloadJson}>
              <Download size={16} />
              JSON данные
            </button>
            <button className="secondary-button" onClick={downloadCsv}>
              <Download size={16} />
              CSV для CRM
            </button>
            <button className="secondary-button" onClick={downloadLeadsCsv}>
              <Download size={16} />
              CSV лиды
            </button>
            <button className="secondary-button" onClick={downloadMoneyCsv} disabled={!moneyLeads.length}>
              <Download size={16} />
              CSV money machine
            </button>
            <button className="secondary-button" onClick={downloadCrmCsv}>
              <Download size={16} />
              CRM pipeline
            </button>
            <button className="secondary-button" onClick={() => window.print()}>
              <Printer size={16} />
              Печать/PDF
            </button>
          </section>

          <section className="drawer-section saved-panel">
            <div className="panel-head">
              <div>
                <span>Сохраненные лиды</span>
                <strong>{savedLeads.length}</strong>
              </div>
              <ShieldCheck size={16} />
            </div>
            <div className="saved-list">
              {savedLeads.slice(0, 6).map((lead) => (
                <article key={lead.id}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>{[lead.city, lead.country].filter(Boolean).join(", ") || lead.website}</span>
                  </div>
                  <button type="button" onClick={() => removeSavedLead(lead.id)} aria-label="Удалить сохраненный лид">
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
              {!savedLeads.length ? <p className="empty-state">Лучшие найденные бизнесы будут сохраняться здесь.</p> : null}
            </div>
          </section>

          <section className="drawer-section next-actions">
            <SectionTitle icon={<Send size={18} />} title="Следующий шаг" inline />
            {report.nextActions.map((action) => (
              <div key={action} className="next-row">
                <ChevronRight size={15} />
                <span>{action}</span>
              </div>
            ))}
          </section>

          <HistoryPanel history={history} onLoad={(item) => acceptReport(item.report, false)} onClear={clearHistory} />
        </aside>
      </main>
    </div>
  );
}

function SectionTitle({ icon, title, inline = false }) {
  return (
    <div className={`section-title ${inline ? "inline" : ""}`}>
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <button type="button" className={`toggle ${checked ? "checked" : ""}`} onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <i />
    </button>
  );
}

function ActionLink({ href, children }) {
  if (!href) {
    return (
      <button type="button" disabled>
        {children}
      </button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function ScoreDial({ score }) {
  return (
    <div className="score-dial" style={{ "--score": `${score * 3.6}deg` }}>
      <div>
        <strong>{score}</strong>
        <span>/100</span>
      </div>
      <p>Conversion score</p>
    </div>
  );
}

function MetricBlock({ icon, label, value, note }) {
  return (
    <article className="metric-block">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function HistoryPanel({ history, onLoad, onClear }) {
  return (
    <section className="history-panel">
      <div className="panel-head">
        <div>
          <History size={16} />
          <span>История</span>
        </div>
        <button className="icon-button" onClick={onClear} aria-label="Очистить историю">
          <Trash2 size={15} />
        </button>
      </div>
      <div className="history-list">
        {history.map((item) => (
          <button key={item.id} onClick={() => onLoad(item)}>
            <span>{item.host || safeHost(item.url)}</span>
            <strong>{item.score}</strong>
          </button>
        ))}
        {!history.length ? <p className="empty-state">Реальные аудиты сохранятся здесь.</p> : null}
      </div>
    </section>
  );
}

function crmFromReport(report) {
  return {
    id: report.id,
    host: report.host,
    status: "Новый",
    value: report.crm.value,
    nextAction: report.crm.nextAction,
    followUpInHours: report.crm.followUpInHours,
    tags: report.crm.tags
  };
}

function crmFromBusiness(business) {
  const normalized = normalizeLead(business);
  const links = getLeadLinks(normalized);
  return {
    id: `lead-${normalized.id}`,
    host: links.website ? safeHost(links.website) : normalized.name,
    status: "Новый",
    value: normalized.estimatedDealValue || normalized.moneyOpportunity || 0,
    nextAction:
      normalized.recommendedAction ||
      (links.website
        ? `Открыть аудит и написать про: ${normalized.topPriority || "быстрый рост заявок"}`
        : "Найти сайт или написать через телефон/карту"),
    followUpInHours: 48,
    tags: [
      normalized.niche || "lead",
      normalized.city || "",
      normalized.priority || "",
      normalized.serviceOffer?.name || "",
      links.website ? "has-site" : normalized.websiteReachable === false ? "bad-site" : "no-site"
    ].filter(Boolean),
    pitch: ownerEmailForLead(normalized)
  };
}

function mergeCrm(incoming, current) {
  return [...incoming, ...current.filter((item) => !incoming.some((next) => next.id === item.id))].slice(0, 30);
}

function mergeLeads(incoming, current) {
  const normalized = incoming.map(normalizeLead).filter((lead) => lead.id && lead.name);
  return [...normalized, ...current.filter((lead) => !normalized.some((next) => next.id === lead.id))].slice(0, 80);
}

function normalizeLead(lead) {
  const safeOutreach = sanitizeLeadOutreach(lead.outreach);
  const safePitch = isLegacyOutreachText(lead.pitch) ? "" : String(lead.pitch || "");
  const normalized = {
    id: lead.id || `${lead.name}-${lead.website || lead.osmUrl || Date.now()}`,
    name: lead.name || "Unknown business",
    city: lead.city || "",
    country: lead.country || "",
    address: lead.address || "",
    website: lead.website || "",
    websiteChecked: Boolean(lead.websiteChecked),
    websiteStatus: Number(lead.websiteStatus || 0),
    websiteReachable: lead.websiteReachable === false ? false : lead.websiteReachable === true ? true : null,
    websiteProblem: lead.websiteProblem || "",
    phone: lead.phone || "",
    email: lead.email || "",
    osmUrl: lead.osmUrl || lead.mapUrl || "",
    mapUrl: lead.mapUrl || lead.osmUrl || "",
    niche: lead.niche || "",
    score: Number(lead.score || lead.automationScore || 0),
    moneyScore: Number(lead.moneyScore || 0),
    priority: lead.priority || "",
    contactRoute: lead.contactRoute || "",
    moneyOpportunity: Number(lead.moneyOpportunity || 0),
    clientOpportunity: Number(lead.clientOpportunity || 0),
    estimatedDealValue: Number(lead.estimatedDealValue || 0),
    recurringValue: Number(lead.recurringValue || 0),
    serviceOffer: lead.serviceOffer || null,
    issue: lead.issue || null,
    recommendedAction: lead.recommendedAction || "",
    pitch: safeOutreach?.email || safePitch,
    outreach: safeOutreach,
    evidence: lead.evidence || [],
    nextSteps: lead.nextSteps || [],
    topPriority: lead.topPriority || lead.suggestedAction || "Ждет аудита",
    source: lead.source || "",
    tags: lead.tags || {},
    savedAt: lead.savedAt || new Date().toISOString()
  };
  if (!normalized.pitch) normalized.pitch = buildLeadPitchFromFields(normalized);
  return normalized;
}

const LEGACY_OUTREACH_PATTERN = /fastest revenue leak|missed demand|exact 3 fixes|For a .+ business this can easily mean|Нет формы заявки/i;

function isLegacyOutreachText(value) {
  return LEGACY_OUTREACH_PATTERN.test(String(value || ""));
}

function sanitizeLeadOutreach(outreach) {
  if (!outreach || typeof outreach !== "object") return null;
  const next = { ...outreach };
  for (const key of ["email", "followUp", "dm", "telegram", "callScript"]) {
    if (isLegacyOutreachText(next[key])) next[key] = "";
  }
  if (next.email || next.followUp || next.dm || next.telegram || next.callScript) return next;
  return null;
}

function mergeLines(current, additions) {
  const seen = new Set();
  return [...String(current || "").split(/\r?\n/), ...additions]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function removeLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore private-mode storage failures.
  }
}

function readInitialBackgroundJob() {
  const savedJob = readLocal("sitemoney.backgroundJob", null);
  return isCurrentJob(savedJob) ? savedJob : null;
}

function readInitialMoneyMachine() {
  const savedJob = readInitialBackgroundJob();
  const savedMachine = readLocal("sitemoney.moneyMachine", emptyMoneyMachine);
  const machineJobId = savedMachine?.jobId || "";
  const hasServerBackedResult = Boolean(
    savedJob?.id &&
      machineJobId &&
      machineJobId === savedJob.id &&
      isCurrentMoneyMachineData(savedMachine)
  );
  if (!hasServerBackedResult) {
    removeLocal("sitemoney.moneyMachine");
    return emptyMoneyMachine;
  }
  return {
    ...emptyMoneyMachine,
    ...savedMachine
  };
}

function isCurrentJob(job) {
  if (!job) return false;
  return job.appVersion === APP_VERSION || job.result?.version === APP_VERSION;
}

function isCurrentMoneyMachineData(data) {
  return Boolean(data && data.version === APP_VERSION);
}

function jobStatusLabel(status) {
  if (status === "queued") return "Скан в очереди";
  if (status === "running") return "Скан продолжается";
  if (status === "completed") return "Последний скан готов";
  if (status === "failed") return "Скан с ошибкой";
  return "Серверный job";
}

function shortJobId(id) {
  return String(id || "").replace(/^job-/, "").slice(0, 12) || "нет ID";
}

function formatJobTime(value) {
  if (!value) return "время не получено";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit"
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function websiteStatusLabel(leadInput) {
  const lead = normalizeLead(leadInput || {});
  if (!lead.website) return "сайт не найден";
  if (lead.websiteReachable === false) return lead.websiteStatus ? `сайт ${lead.websiteStatus}` : "сайт ошибка";
  if (lead.websiteReachable === true) return lead.websiteStatus ? `сайт проверен ${lead.websiteStatus}` : "сайт проверен";
  return "сайт требует проверки";
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function safeHost(value) {
  try {
    return new URL(safeExternalUrl(value) || value).hostname;
  } catch {
    return String(value || "site");
  }
}

function safeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const firstCandidate = raw.split(/[;|\s]+/).find(Boolean) || "";
    if (!firstCandidate || /^mailto:|^tel:/i.test(firstCandidate)) return "";
    const withProtocol = /^https?:\/\//i.test(firstCandidate) ? firstCandidate : `https://${firstCandidate}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function getLeadLinks(leadInput) {
  const lead = normalizeLead(leadInput || {});
  const website = lead.websiteReachable === false ? "" : safeExternalUrl(lead.website);
  const osm = safeExternalUrl(lead.osmUrl);
  const map = safeExternalUrl(lead.mapUrl);
  const search = buildLeadSearchUrl(lead);
  const email = lead.email
    ? `mailto:${lead.email}?subject=${encodeURIComponent(lead.outreach?.subject || `Website note for ${lead.name}`)}&body=${encodeURIComponent(ownerEmailForLead(lead))}`
    : "";
  const phoneDigits = String(lead.phone || "").replace(/[^\d+]/g, "");
  const phone = phoneDigits.length >= 7 ? `tel:${phoneDigits}` : "";
  return {
    website,
    osm,
    map: map || osm,
    search,
    email,
    phone,
    best: website || map || osm || search
  };
}

function buildLeadSearchUrl(leadInput) {
  const lead = normalizeLead(leadInput || {});
  const query = [lead.name, lead.city, lead.country, lead.niche, "website", "contact"]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildLeadPitchFallback(leadInput) {
  const lead = normalizeLead(leadInput || {});
  return buildLeadPitchFromFields(lead);
}

function buildLeadPitchFromFields(lead) {
  const location = [lead.city, lead.country].filter(Boolean).join(", ");
  const issue = ownerSafeIssueTitle(lead.opportunity || lead.topPriority || "one small website issue");
  if (lead.websiteReachable === false) {
    const statusPhrase = lead.websiteStatus ? `returned HTTP ${lead.websiteStatus}` : "did not load from my check";
    return [
      `Subject: Public website link for ${lead.name}`,
      "",
      `Hi ${lead.name} team,`,
      "",
      `I found your public listing${location ? ` in ${location}` : ""}. The website link I found ${statusPhrase}.`,
      "",
      "I do not want to assume it is broken for every visitor, but if that is the same link customers see from search or maps, it is worth fixing before talking about design or ads.",
      "",
      "I can send a short screenshot note with the exact link I checked and the first fix I would make.",
      "",
      "Should I send the screenshot note?"
    ].join("\n");
  }
  if (!lead.website) {
    return [
      `Subject: Small website idea for ${lead.name}`,
      "",
      `Hi ${lead.name} team,`,
      "",
      `I found your public listing${location ? ` in ${location}` : ""}, but I could not find a clear working website from it.`,
      "",
      "The useful first step would be a simple service page with phone, map, and a short request form.",
      "",
      "I can send a quick mockup first so you can judge it before talking about any work.",
      "",
      "Should I send the mockup?"
    ].join("\n");
  }
  return [
    `Subject: Small website fix for ${lead.name}`,
    "",
    `Hi ${lead.name} team,`,
    "",
    `I opened your website and noticed one practical issue: ${issue}.`,
    "",
    "I am not pitching a full redesign. I can send a 1-page screenshot plan showing the issue, the fix, and what I would change first.",
    "",
    "If it looks useful, I can implement it as a fixed-price quick sprint.",
    "",
    "Should I send the screenshot plan?"
  ].join("\n");
}

function ownerSafeIssueTitle(value) {
  const text = String(value || "").trim();
  const key = text.toLowerCase();
  if (!text) return "one small website issue";
  if (!/[А-Яа-яЁё]/.test(text)) return text;
  if (key.includes("нет формы")) return "the request form is missing or too hard to find";
  if (key.includes("нет быстрого контакта")) return "the fastest contact path is hard to find";
  if (key.includes("мобиль") || key.includes("https")) return "the mobile or security basics need checking";
  if (key.includes("призыв")) return "the main call-to-action can be clearer";
  if (key.includes("довер")) return "the page needs stronger trust proof";
  if (key.includes("локаль")) return "the local search intent can be clearer";
  if (key.includes("schema")) return "the local business schema is missing";
  if (key.includes("медлен")) return "the page speed needs a quick check";
  if (key.includes("сайт уже")) return "the request path can be measured and improved";
  return "one small website issue";
}

function ownerEmailForLead(leadInput) {
  const lead = normalizeLead(leadInput || {});
  return lead.outreach?.email || lead.pitch || buildLeadPitchFallback(lead);
}

function buildLeadSteps(leadInput) {
  const lead = normalizeLead(leadInput || {});
  return [
    lead.website ? "Проверить сайт через аудит внутри SiteMoney" : "Открыть карту или Google и найти сайт/телефон",
    "Скопировать питч и отправить владельцу вручную",
    "Добавить лид в CRM со статусом Новый",
    "Через 48 часов отправить follow-up"
  ];
}

function buildLeadDossier(leadInput) {
  const lead = normalizeLead(leadInput || {});
  const links = getLeadLinks(lead);
  const steps = (lead.nextSteps?.length ? lead.nextSteps : buildLeadSteps(lead)).map((step, index) => `${index + 1}. ${step}`);
  const evidence = (lead.evidence || []).slice(0, 6).map((item) => `- ${item}`);
  return [
    `#${lead.rank || ""} ${lead.name}`.trim(),
    [lead.city, lead.country].filter(Boolean).join(", "),
    lead.address ? `Address: ${lead.address}` : "",
    `Priority: ${lead.priority || "lead"} | Money score: ${lead.moneyScore || lead.score || 0}`,
    `Offer: ${lead.serviceOffer?.name || "Conversion Sprint"} (${moneyText(lead.estimatedDealValue || lead.serviceOffer?.price || 0)})`,
    `Problem: ${lead.opportunity || lead.topPriority || "Lead capture gap"}`,
    `Best action: ${lead.recommendedAction || "Check contact and send pitch"}`,
    "",
    "Links:",
    links.website ? `Website: ${links.website}` : lead.websiteReachable === false ? `Website: blocked from direct open (${lead.websiteProblem || `HTTP ${lead.websiteStatus}`})` : "Website: not found",
    links.map ? `Map: ${links.map}` : "",
    `Search: ${links.search}`,
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.email ? `Email: ${lead.email}` : "",
    "",
    "Owner email:",
    ownerEmailForLead(lead),
    "",
    "48h follow-up:",
    buildLeadFollowUp(lead),
    "",
    "Evidence:",
    evidence.length ? evidence.join("\n") : "- Needs manual contact check",
    "",
    "Steps:",
    steps.join("\n")
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildLeadFollowUp(leadInput) {
  const lead = normalizeLead(leadInput || {});
  if (lead.outreach?.followUp) return lead.outreach.followUp;
  if (lead.websiteReachable === false) {
    const status = lead.websiteStatus ? `HTTP ${lead.websiteStatus}` : "did not load";
    return `Quick follow-up on ${lead.name}: the public website link I found returned ${status}. I can send the screenshot and exact link first, no redesign pitch.`;
  }
  const issue = lead.opportunity || lead.topPriority || "one small website issue";
  return `Quick follow-up on ${lead.name}: I found one small website fix worth checking (${issue}). I can send the screenshot plan first so you can judge it before talking about any work.`;
}

function moneyText(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
}

function buildReportHtml(report) {
  const priorities = report.priorities
    .map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.fix)}</li>`)
    .join("");
  const evidence = report.evidence
    .map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(String(item.value))}</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SiteMoney Report - ${escapeHtml(report.host)}</title>
<style>
body{font-family:Inter,Arial,sans-serif;color:#eaf2ff;background:#05070b;margin:40px;line-height:1.45}
h1{font-size:34px;margin:0 0 6px} h2{margin-top:32px;color:#8fc7ff}
.score{display:inline-flex;align-items:center;gap:14px;background:#0c1526;border:1px solid #2f7dff;padding:14px 18px;border-radius:8px}
.score strong{font-size:42px;color:#38d5ff} table{border-collapse:collapse;width:100%;margin-top:12px}
td{border-bottom:1px solid #21314c;padding:10px 0} li{margin:10px 0}
pre{white-space:pre-wrap;background:#0c1526;border:1px solid #21314c;border-radius:8px;padding:16px}
</style>
</head>
<body>
<h1>SiteMoney Audit: ${escapeHtml(report.businessName || report.host)}</h1>
<p>${escapeHtml(report.finalUrl || report.input.url)}</p>
<div class="score"><strong>${report.score.total}</strong><span>${escapeHtml(report.score.label)}<br>${escapeHtml(report.score.grade)}</span></div>
<h2>Money opportunity</h2>
<p>${money(report.money.monthlyOpportunity)} / month estimate from ${report.money.extraLeads} possible extra leads. This is a sales conversation estimate, not a guarantee.</p>
<h2>Priority fixes</h2>
<ol>${priorities}</ol>
<h2>Evidence</h2>
<table>${evidence}</table>
<h2>Outreach message</h2>
<pre>${escapeHtml(report.outreach.email)}</pre>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

createRoot(document.getElementById("root")).render(<App />);
