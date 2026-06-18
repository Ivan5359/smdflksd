import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BadgeDollarSign,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  History,
  Loader2,
  Mail,
  Play,
  Plus,
  Printer,
  Radar,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Zap
} from "lucide-react";
import { APP_VERSION } from "./lib/auditEngine.js";
import { demoReport } from "./sampleAudit.js";
import "./styles.css";

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
  const [bulkResults, setBulkResults] = useState([]);
  const [messageTab, setMessageTab] = useState("email");
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [serverVersion, setServerVersion] = useState(APP_VERSION);

  useEffect(() => {
    fetch("/__version")
      .then((response) => response.json())
      .then((payload) => setServerVersion(payload.version || APP_VERSION))
      .catch(() => setServerVersion(APP_VERSION));
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

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
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
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
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

  return (
    <div className="app-shell">
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
          <a href="#audit">Аудит</a>
          <a href="#automation">Автопилот</a>
          <a href="#crm">CRM</a>
          <a href="#export">Экспорт</a>
        </nav>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={loadDemo}>
            <Sparkles size={16} />
            Демо
          </button>
          <button className="primary-button" onClick={(event) => runAudit(event)} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            Запустить
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="automation-rail" id="automation">
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

          <div className="queue-panel">
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
          </div>

          {error ? (
            <div className="error-banner">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <HistoryPanel history={history} onLoad={(item) => acceptReport(item.report, false)} onClear={clearHistory} />
        </aside>

        <section className="cockpit" id="audit">
          <div className="cockpit-head">
            <div>
              <p>Деньги в приоритете</p>
              <h2>{report.businessName || report.host}</h2>
              <a href={report.finalUrl || report.input.url} target="_blank" rel="noreferrer">
                {report.host}
                <ExternalLink size={14} />
              </a>
            </div>
            <div className="status-stack">
              <span>{report.score.grade}</span>
              <strong>{report.score.label}</strong>
            </div>
          </div>

          <div className="signal-grid">
            <ScoreDial score={report.score.total} />
            <MetricBlock
              icon={<BadgeDollarSign size={18} />}
              label="Потенциал/мес"
              value={money(report.money.monthlyOpportunity)}
              note={`${report.money.extraLeads} доп. лидов, ${report.money.confidence}% confidence`}
            />
            <MetricBlock
              icon={<TrendingUp size={18} />}
              label="Пакет продажи"
              value={report.package.suggestedAnchor}
              note={report.package.tiers[1].name}
            />
            <MetricBlock
              icon={<Target size={18} />}
              label="Главный рычаг"
              value={topPriority?.moneyWeight || 0}
              note={topPriority?.title || "growth"}
            />
          </div>

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

          <div className="main-grid">
            <section className="priority-zone">
              <SectionTitle icon={<Activity size={18} />} title="Продаваемые правки" inline />
              <div className="priority-list">
                {report.priorities.slice(0, 6).map((priority, index) => (
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

            <section className="timeline-zone">
              <SectionTitle icon={<BarChart3 size={18} />} title="Автоматизация" inline />
              <div className="timeline">
                {report.automation.steps.map((step) => (
                  <div key={step.label} className={`timeline-row ${step.status}`}>
                    <i />
                    <div>
                      <strong>{step.label}</strong>
                      <span>{step.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="money-note">
                <ShieldCheck size={17} />
                <span>{report.money.disclaimer}</span>
              </div>
            </section>
          </div>

          <section className="evidence-zone">
            <SectionTitle icon={<FileText size={18} />} title="Факты из сайта" inline />
            <div className="evidence-table">
              {report.evidence.slice(0, 14).map((item) => (
                <div key={item.label} className="evidence-row">
                  <span>{item.label}</span>
                  <strong className={item.good ? "good" : "bad"}>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          {sortedBulk.length ? (
            <section className="bulk-zone">
              <SectionTitle icon={<Radar size={18} />} title="Лучшие цели из очереди" inline />
              <div className="bulk-list">
                {sortedBulk.slice(0, 5).map((item) => (
                  <button key={item.id} onClick={() => acceptReport(item, true)}>
                    <span>{item.host}</span>
                    <strong>{money(item.money.monthlyOpportunity)}</strong>
                    <em>{item.score.total}</em>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <aside className="action-rail">
          <section>
            <SectionTitle icon={<Mail size={18} />} title="Готовое сообщение" />
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
            <button className="secondary-button wide" onClick={() => copyText("message", activeMessage)}>
              {copied === "message" ? <Check size={16} /> : <Copy size={16} />}
              Скопировать
            </button>
          </section>

          <section className="package-panel">
            <SectionTitle icon={<BadgeDollarSign size={18} />} title="Пакет на продажу" inline />
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

          <section className="crm-panel" id="crm">
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

          <section className="export-panel" id="export">
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
            <button className="secondary-button" onClick={() => window.print()}>
              <Printer size={16} />
              Печать/PDF
            </button>
          </section>

          <section className="next-actions">
            <SectionTitle icon={<Send size={18} />} title="Следующий шаг" inline />
            {report.nextActions.map((action) => (
              <div key={action} className="next-row">
                <ChevronRight size={15} />
                <span>{action}</span>
              </div>
            ))}
          </section>
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

function mergeCrm(incoming, current) {
  return [...incoming, ...current.filter((item) => !incoming.some((next) => next.id === item.id))].slice(0, 30);
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

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function safeHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return String(value || "site");
  }
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
