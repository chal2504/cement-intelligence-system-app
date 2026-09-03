"use client";

import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  BarChart,
  Bar,
} from "recharts";
import { EditionData, PriceRow, RiskItem, NewsItem, MarketMovesItem, DailyPulse } from "@/lib/dataLoader";

interface DashboardProps {
  allEditions: EditionData[];
  latestEdition: EditionData;
  dailyPulse?: DailyPulse | null;
}

export default function Dashboard({ allEditions, latestEdition, dailyPulse }: DashboardProps) {
  // 1. Core States
  const [activeEditionNum, setActiveEditionNum] = useState<number>(latestEdition.meta.edition);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [currencyMode, setCurrencyMode] = useState<"usd" | "local">("usd");
  const [selectedIndicator, setSelectedIndicator] = useState<string>("Brent");
  const [newsCategoryFilter, setNewsCategoryFilter] = useState<string>("all");
  const [newsSearchQuery, setNewsSearchQuery] = useState<string>("");
  const [isMounted, setIsMounted] = useState(false);

  // Advanced News states
  const [searchAllEditions, setSearchAllEditions] = useState<boolean>(false);
  const [savedNewsUrls, setSavedNewsUrls] = useState<string[]>([]);
  const [showSavedOnly, setShowSavedOnly] = useState<boolean>(false);
  const [hideDuplicates, setHideDuplicates] = useState<boolean>(false);
  const [showDomicemOnly, setShowDomicemOnly] = useState<boolean>(false);
  const [marketMoveFilter, setMarketMoveFilter] = useState<string>("all");

  // Accordion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    currentEdition.sections.forEach((s) => {
      allExpanded[s.id] = true;
    });
    setExpandedSections(allExpanded);
  };

  const collapseAll = () => {
    setExpandedSections({});
  };

  // Settings / Watchlist state
  const [brentThreshold, setBrentThreshold] = useState<number>(95);
  const [watchlist, setWatchlist] = useState<string[]>([
    "Brent",
    "Clinker CIF Caribe",
    "Handysize (BHSI) — clase clave clinker",
  ]);

  // Set mounted
  useEffect(() => {
    setIsMounted(true);
    // Load theme from localstorage if exists
    const storedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (storedTheme) {
      setTheme(storedTheme);
      document.documentElement.setAttribute("data-theme", storedTheme);
    } else {
      document.documentElement.setAttribute("data-theme", "light");
    }

    // Load saved news from localStorage
    const saved = localStorage.getItem("saved_news");
    if (saved) {
      try {
        setSavedNewsUrls(JSON.parse(saved));
      } catch (err) {
        console.error("Error parsing saved_news:", err);
      }
    }

    // Register Service Worker for PWA
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("Service Worker registered successfully:", reg.scope))
          .catch((err) => console.error("Service Worker registration failed:", err));
      });
    }
  }, []);

  // Theme Toggler
  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  // Get active edition data
  const currentEdition =
    allEditions.find((e) => e.meta.edition === activeEditionNum) || latestEdition;

  // Conversion rates based on active edition's rates in the table
  const getExchangeRate = (currency: string): number => {
    if (currency === "TRY") return 47.19;
    if (currency === "COP") return 3218;
    if (currency === "DOP") return 58.55;
    return 1;
  };

  // Format value to Local Currency or USD
  const formatPriceValue = (row: PriceRow) => {
    const val = row.value;
    if (currencyMode === "usd" || !row.numeric) {
      return val;
    }

    // Try to convert based on currency context in row indicator/group
    const text = (row.indicator + " " + row.group).toLowerCase();
    let rate = 1;
    let symbol = "US$";
    let suffix = "";

    if (text.includes("try") || text.includes("turqu")) {
      rate = getExchangeRate("TRY");
      symbol = "TRY ";
    } else if (text.includes("cop") || text.includes("colomb")) {
      rate = getExchangeRate("COP");
      symbol = "COP ";
    } else if (text.includes("dop") || text.includes("dominic")) {
      rate = getExchangeRate("DOP");
      symbol = "DOP ";
    } else {
      // Default fallback
      return val;
    }

    if (val.includes("-") || val.includes("–")) {
      // It's a range (e.g. US$45-47/t)
      const parts = val.replace(/US\$/g, "").split(/[–-]/);
      if (parts.length === 2) {
        const low = parseFloat(parts[0].trim()) * rate;
        const high = parseFloat(parts[1].replace(/[^0-9.]/g, "").trim()) * rate;
        const unit = val.includes("/") ? "/" + val.split("/")[1] : "";
        return `${symbol}${low.toFixed(0)}–${high.toFixed(0)}${unit}`;
      }
    }

    // Single value
    const baseVal = row.numeric;
    const converted = baseVal * rate;
    const unit = val.includes("/") ? "/" + val.split("/")[1] : "";
    return `${symbol}${converted.toLocaleString(undefined, { maximumFractionDigits: 0 })}${unit}`;
  };

  // Compile historical trend data for the selected indicator
  const getHistoricalData = () => {
    return allEditions.map((e) => {
      const row = e.priceBoard.find((r) => r.indicator === selectedIndicator);
      return {
        edition: `Edición #${e.meta.edition}`,
        valor: row ? row.numeric : null,
        fullValue: row ? row.value : "n/d",
      };
    });
  };

  // Trigger watchlist alert checks
  const getWatchlistAlerts = () => {
    const alerts: string[] = [];
    const brentRow = currentEdition.priceBoard.find((r) => r.indicator === "Brent");
    if (brentRow && brentRow.numeric && brentRow.numeric > brentThreshold) {
      alerts.push(
        `Alerta Watchlist: Brent está a US$${brentRow.numeric}/bbl, superando el umbral definido de US$${brentThreshold}/bbl.`
      );
    }

    // Check custom threshold for Clinker CIF if in watchlist
    const clinkerCIF = currentEdition.priceBoard.find((r) => r.indicator === "Clinker CIF Caribe");
    if (clinkerCIF && clinkerCIF.numeric && clinkerCIF.numeric > 80) {
      alerts.push(
        `Alerta Watchlist: Clinker CIF Caribe estimado en US$${clinkerCIF.numeric}/t supera la barrera crítica de US$80/t.`
      );
    }
    return alerts;
  };

  const activeAlerts = getWatchlistAlerts();

  // Toggle saving a news item URL in localStorage
  const toggleSaveNews = (url: string) => {
    let nextSaved: string[];
    if (savedNewsUrls.includes(url)) {
      nextSaved = savedNewsUrls.filter((u) => u !== url);
    } else {
      nextSaved = [...savedNewsUrls, url];
    }
    setSavedNewsUrls(nextSaved);
    localStorage.setItem("saved_news", JSON.stringify(nextSaved));
  };

  // Check if a news URL appeared in any edition earlier than `itemEdNum`
  const isNewsDuplicate = (itemUrl: string, itemEdNum: number) => {
    return allEditions.some(
      (e) => e.meta.edition < itemEdNum && e.news.some((n) => n.url === itemUrl)
    );
  };

  // Compile source news list depending on whether we search across all editions
  const getSourceNewsList = () => {
    if (searchAllEditions) {
      return allEditions.flatMap((e) =>
        e.news.map((n) => ({
          ...n,
          editionNum: e.meta.edition,
          editionWeek: e.meta.week,
        }))
      );
    } else {
      return currentEdition.news.map((n) => ({
        ...n,
        editionNum: currentEdition.meta.edition,
        editionWeek: currentEdition.meta.week,
      }));
    }
  };

  // News Filtering
  const getNewsCategories = () => {
    const cats = new Set<string>();
    // Collect categories across all editions to include all available ones
    allEditions.forEach((e) => e.news.forEach((n) => cats.add(n.category)));
    return Array.from(cats);
  };

  const filteredNews = getSourceNewsList().filter((item) => {
    // 1. Saved only filter
    if (showSavedOnly && !savedNewsUrls.includes(item.url)) {
      return false;
    }
    // 2. Domicem only filter
    if (showDomicemOnly && !item.domicemImpact) {
      return false;
    }
    // 3. Hide duplicates filter
    if (hideDuplicates && isNewsDuplicate(item.url, item.editionNum)) {
      return false;
    }
    // 4. Category filter
    if (newsCategoryFilter !== "all" && item.category !== newsCategoryFilter) {
      return false;
    }
    // 5. Text search filter
    const matchesSearch =
      newsSearchQuery === "" ||
      item.title.toLowerCase().includes(newsSearchQuery.toLowerCase()) ||
      item.source.toLowerCase().includes(newsSearchQuery.toLowerCase());

    return matchesSearch;
  });

  // Market moves filtering
  const getUniqueMarkets = () => {
    const markets = new Set<string>();
    currentEdition.marketMoves.forEach((m) => {
      if (m.market) {
        markets.add(m.market.trim());
      }
    });
    return Array.from(markets);
  };

  const filteredMarketMoves = currentEdition.marketMoves.filter((m) => {
    return marketMoveFilter === "all" || m.market.trim() === marketMoveFilter;
  });

  const getDayOfYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  };

  const getTodayFormatted = () => {
    const now = new Date();
    return now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  };

  const getDailyHighlight = () => {
    const pool: any[] = [];
    
    // Add executiveSummary items
    currentEdition.executiveSummary.forEach(item => {
      pool.push({
        type: "Resumen Ejecutivo",
        tag: item.categoryLabel,
        title: item.title,
        description: item.description
      });
    });

    // Add marketMoves items
    currentEdition.marketMoves.forEach(item => {
      pool.push({
        type: "Movimiento de Mercado",
        tag: item.market,
        title: `${item.actor}: ${item.action}`,
        description: `${item.detail} | Impacto: ${item.impact}`
      });
    });

    // Add risks.critical items
    currentEdition.risks.critical.forEach(item => {
      pool.push({
        type: "Riesgo Crítico",
        tag: "Crítico",
        title: item.title,
        description: item.description
      });
    });

    if (pool.length === 0) return null;

    const dayOfYear = getDayOfYear();
    const index = dayOfYear % pool.length;
    return pool[index];
  };

  return (
    <div>
      {/* ---------- HEADER ---------- */}
      <header className="top">
        <div className="top-inner">
          <div className="brand">
            <h1>🧭 Cement Intelligence System</h1>
            <span className="tag">Dashboard semanal · Argos Puerto Rico + Domicem</span>
          </div>

          <div className="top-meta">
            {/* Edition Switcher */}
            <div>
              <label htmlFor="edition-select" style={{ marginRight: "6px", fontWeight: 600 }}>
                Edición activa:
              </label>
              <select
                id="edition-select"
                value={activeEditionNum}
                onChange={(e) => setActiveEditionNum(parseInt(e.target.value))}
                style={{
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text-primary)",
                  fontWeight: 650,
                  fontSize: "12.5px",
                }}
              >
                {allEditions.map((ed) => (
                  <option key={ed.meta.edition} value={ed.meta.edition}>
                    Edición #{ed.meta.edition} ({ed.meta.week})
                  </option>
                ))}
              </select>
            </div>

            <span>⏱ ~13 min</span>

            <button className="toggle" onClick={toggleTheme} aria-label="Toggle Theme">
              <span id="tgl-ic">{theme === "light" ? "🌙" : "☀️"}</span>
              <span id="tgl-tx">{theme === "light" ? "Oscuro" : "Claro"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---------- WRAPPER & MAIN LAYOUT ---------- */}
      <div className="wrap">
        {/* HOY / TODAY MODULE */}
        <section style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            
            {/* 1) Indicators strip — PULSO DIARIO (data/daily/pulse.json), fresco cada dia habil */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                overflowX: "auto",
                padding: "8px 0",
                borderBottom: "1px solid var(--border)",
                alignItems: "center"
              }}
              className="no-scrollbar"
            >
              <span style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", whiteSpace: "nowrap", marginRight: "8px" }}>
                ⚡ PULSO DE HOY{dailyPulse?.updatedLabel ? ` · ${dailyPulse.updatedLabel}` : ""}:
              </span>

              {dailyPulse && dailyPulse.indicators && dailyPulse.indicators.length > 0 ? (
                dailyPulse.indicators.map((ind) => {
                  const sentimentClass = ind.sentiment === "favorable" ? "up" : ind.sentiment === "adverse" ? "down" : "flat";
                  return (
                    <div
                      key={ind.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "var(--plane)",
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: "1px solid var(--border)",
                        whiteSpace: "nowrap"
                      }}
                    >
                      <span style={{ fontWeight: "bold", fontSize: "12.5px" }}>{ind.label}:</span>
                      <span style={{ fontWeight: 650, fontSize: "12.5px", color: "var(--text-primary)" }}>{ind.value}</span>
                      <span className={sentimentClass} style={{ fontSize: "11px", fontWeight: "bold" }}>
                        {ind.delta}
                      </span>
                    </div>
                  );
                })
              ) : (
                // Respaldo: si aun no hay pulso diario, muestra los precios de la edicion semanal
                [
                  { key: "Brent", label: "Brent" },
                  { key: "WTI", label: "WTI" },
                  { key: "Panamax", label: "Panamax" },
                  { key: "COP", label: "USD/COP" },
                  { key: "Diésel", label: "Diésel EE.UU." }
                ].map((indInfo) => {
                  const row = currentEdition.priceBoard.find(r =>
                    r.indicator.toLowerCase().includes(indInfo.key.toLowerCase()) ||
                    (indInfo.key === "Diésel" && r.indicator.toLowerCase().includes("diesel"))
                  );
                  if (!row) return null;
                  const sentimentClass = row.week.sentiment === "favorable" ? "up" : row.week.sentiment === "adverse" ? "down" : "flat";
                  return (
                    <div
                      key={indInfo.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "var(--plane)",
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: "1px solid var(--border)",
                        whiteSpace: "nowrap"
                      }}
                    >
                      <span style={{ fontWeight: "bold", fontSize: "12.5px" }}>{indInfo.label}:</span>
                      <span style={{ fontWeight: 650, fontSize: "12.5px", color: "var(--text-primary)" }}>{row.value}</span>
                      <span className={sentimentClass} style={{ fontSize: "11px", fontWeight: "bold" }}>
                        {row.week.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* 1b) Alerta del dia (pulse.breaking) — solo si hay algo extraordinario hoy */}
            {dailyPulse?.breaking && (
              <a
                href={dailyPulse.breaking.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  textDecoration: "none",
                  background: "rgba(208, 59, 59, 0.08)",
                  border: "1px solid rgba(208, 59, 59, 0.25)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "16px" }}>🚨</span>
                  <span style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--critical)" }}>
                    Alerta de hoy
                  </span>
                </div>
                <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "bold", color: "var(--text-primary)" }}>
                  {dailyPulse.breaking.title}
                </h4>
                <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  {dailyPulse.breaking.detail}
                </p>
              </a>
            )}

            {/* 2) Daily highlight card */}
            {(() => {
              const highlight = getDailyHighlight();
              if (!highlight) return null;
              
              let tagBg = "rgba(42, 120, 214, 0.1)";
              let tagColor = "var(--s1)";
              if (highlight.type === "Riesgo Crítico") {
                tagBg = "rgba(208, 59, 59, 0.1)";
                tagColor = "var(--critical)";
              } else if (highlight.type === "Movimiento de Mercado") {
                tagBg = "rgba(235, 104, 52, 0.1)";
                tagColor = "var(--s2)";
              }

              return (
                <div
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.02)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                          background: tagBg,
                          color: tagColor,
                          padding: "2px 8px",
                          borderRadius: "4px"
                        }}
                      >
                        {highlight.type} ({highlight.tag})
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      🕒 Destacado del {getTodayFormatted()}
                    </span>
                  </div>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: "14.5px", fontWeight: "bold", color: "var(--text-primary)" }}>
                    {highlight.title}
                  </h4>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                    {highlight.description}
                  </p>
                </div>
              );
            })()}

          </div>
        </section>

        {/* HERO SECTION */}
        <section className="hero">
          <div className="eyebrow">{currentEdition.hero.eyebrow}</div>
          <h2>{currentEdition.hero.title}</h2>
          <p className="lede">{currentEdition.hero.lede}</p>
          <p className="stamp">{currentEdition.hero.stamp}</p>
        </section>

        {/* ALERTS TICKER BAR */}
        {activeAlerts.length > 0 && (
          <div
            style={{
              background: "rgba(208, 59, 59, 0.08)",
              border: "1px solid rgba(208, 59, 59, 0.2)",
              borderRadius: "10px",
              padding: "10px 14px",
              marginBottom: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            {activeAlerts.map((alert, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--critical)" }}>
                <span style={{ fontSize: "16px" }}>⚠️</span>
                <strong>{alert}</strong>
              </div>
            ))}
          </div>
        )}

        <div className="layout">
          {/* SIDEBAR NAVIGATION */}
          <nav className="side" aria-label="Secciones">
            <ol>
              <li><a href="#s1">Resumen ejecutivo</a></li>
              <li><a href="#s14">Semáforo de riesgos</a></li>
              <li><a href="#s15">Tablero de precios</a></li>
              <li><a href="#board">Para Argos PR y Domicem</a></li>
              {currentEdition.sections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`}>{sec.title}</a>
                </li>
              ))}
              <li><a href="#salerts">Alertas & Movimientos</a></li>
              <li><a href="#snews">Noticias & fuentes</a></li>
              <li><a href="#sadjust">Ajustes</a></li>
            </ol>
          </nav>

          {/* MAIN DASHBOARD SECTIONS */}
          <main>
            {/* 1. EXECUTIVE SUMMARY */}
            <section id="s1">
              <div className="sec-head">
                <span className="sec-num">1</span>
                <h3 className="sec-title">Resumen ejecutivo</h3>
              </div>
              <div className="sec-sub">Los 10 eventos de la semana y por qué importan.</div>
              <div className="card">
                <ol className="events">
                  {currentEdition.executiveSummary.map((item, idx) => (
                    <li key={idx}>
                      <span className="ev-t">
                        {item.title}
                        <span className={`chip c-${item.category === "cost" ? "cost" : item.category === "demand" ? "dem" : item.category === "competition" ? "comp" : item.category === "regulation" ? "reg" : "opp"}`}>
                          {item.categoryLabel}
                        </span>
                      </span>
                      <span className="ev-w">{item.description}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            {/* 14. RISK SEMAFORO */}
            <section id="s14">
              <div className="sec-head">
                <span className="sec-num">14</span>
                <h3 className="sec-title">Semáforo de riesgos</h3>
              </div>
              <div className="sec-sub">Lo que el consejo debe vigilar — con consecuencias y acciones sugeridas.</div>
              <div className="grid3">
                {/* Critical */}
                <div className="risk-col">
                  <h4><span className="dot" style={{ background: "var(--critical)" }}></span>🔴 Críticos</h4>
                  <ul>
                    {currentEdition.risks.critical.map((risk, idx) => (
                      <li key={idx}>
                        <b>{risk.title}</b>
                        <span>{risk.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Emerging */}
                <div className="risk-col">
                  <h4><span className="dot" style={{ background: "var(--warning)" }}></span>🟡 Emergentes</h4>
                  <ul>
                    {currentEdition.risks.emerging.map((risk, idx) => (
                      <li key={idx}>
                        <b>{risk.title}</b>
                        <span>{risk.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Opportunities */}
                <div className="risk-col">
                  <h4><span className="dot" style={{ background: "var(--good)" }}></span>🟢 Oportunidades</h4>
                  <ul>
                    {currentEdition.risks.opportunities.map((risk, idx) => (
                      <li key={idx}>
                        <b>{risk.title}</b>
                        <span>{risk.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* 15. PRICE BOARD & HISTORICAL CHARTS */}
            <section id="s15">
              <div className="sec-head">
                <span className="sec-num">15</span>
                <h3 className="sec-title">Tablero de precios &amp; KPIs</h3>
              </div>
              <div className="sec-sub">Presiona sobre un indicador para graficar su serie histórica en el panel inferior.</div>
              
              <div className="card" style={{ padding: "14px" }}>
                {/* Toggle costo/divisa */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                  <button
                    onClick={() => setCurrencyMode(currencyMode === "usd" ? "local" : "usd")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--plane)",
                      color: "var(--text-primary)",
                      fontWeight: "bold",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    💱 Mostrar en: {currencyMode === "usd" ? "Divisas Locales (TRY/COP/DOP)" : "Dólares (USD)"}
                  </button>
                </div>

                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Indicador</th>
                        <th>Precio / nivel</th>
                        <th>Δ Sem</th>
                        <th>Δ Mes</th>
                        <th>Δ Año</th>
                        <th>Referencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* We iterate over items and group them */}
                      {(() => {
                        const rows: React.ReactNode[] = [];
                        let lastGroup = "";
                        currentEdition.priceBoard.forEach((row, idx) => {
                          if (row.group !== lastGroup) {
                            lastGroup = row.group;
                            rows.push(
                              <tr key={`g-${idx}`} className="grp">
                                <td colSpan={6}>{lastGroup}</td>
                              </tr>
                            );
                          }
                          const isSelected = selectedIndicator === row.indicator;
                          rows.push(
                            <tr
                              key={`r-${idx}`}
                              onClick={() => setSelectedIndicator(row.indicator)}
                              style={{
                                cursor: "pointer",
                                background: isSelected ? "rgba(42, 120, 214, 0.08)" : undefined,
                                borderLeft: isSelected ? "3px solid var(--s1)" : undefined,
                              }}
                            >
                              <td>
                                {row.indicator}
                                {row.est && <span className="est-tag">EST</span>}
                                {watchlist.includes(row.indicator) && <span style={{ marginLeft: "6px", fontSize: "10px" }}>⭐</span>}
                              </td>
                              <td style={{ fontWeight: 600 }}>{formatPriceValue(row)}</td>
                              <td className={row.week.sentiment === "favorable" ? "up" : row.week.sentiment === "adverse" ? "down" : "flat"}>
                                {row.week.label}
                              </td>
                              <td className={row.month.sentiment === "favorable" ? "up" : row.month.sentiment === "adverse" ? "down" : "flat"}>
                                {row.month.label}
                              </td>
                              <td className={row.year.sentiment === "favorable" ? "up" : row.year.sentiment === "adverse" ? "down" : "flat"}>
                                {row.year.label}
                              </td>
                              <td>
                                <small className="src">{row.reference}</small>
                              </td>
                            </tr>
                          );
                        });
                        return rows;
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dynamic Line Chart (Historical Trend) */}
              <div className="card">
                <h4>Serie histórica: {selectedIndicator}</h4>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
                  Evolución semana a semana de los valores numéricos indicativos.
                </p>

                {isMounted ? (
                  <div style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={getHistoricalData()} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis dataKey="edition" stroke="var(--muted)" fontSize={11} />
                        <YAxis stroke="var(--muted)" fontSize={11} domain={["auto", "auto"]} />
                        <RechartsTooltip
                          contentStyle={{
                            background: "var(--card)",
                            borderColor: "var(--border)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <Line type="monotone" dataKey="valor" stroke="var(--s1)" strokeWidth={3} activeDot={{ r: 8 }} name="Valor" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ height: "260px", background: "var(--plane)", display: "grid", placeItems: "center" }}>
                    Cargando gráfico...
                  </div>
                )}
              </div>

              {/* Stacked Landed Cost Chart */}
              <div className="card chart-card">
                <h4>Costo puesto del clinker en el Caribe, por origen <span className="est-tag">EST indicativo</span></h4>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 14px" }}>
                  Barras apiladas: <b>FOB (fábrica) + Flete marítimo</b>. Colombia lidera en competitividad de costo puesto por flete corto.
                </p>

                {isMounted ? (
                  <div style={{ width: "100%", height: 300 }}>
                    <ResponsiveContainer>
                      <BarChart
                        layout="vertical"
                        data={currentEdition.landedCostChart.origins}
                        margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis type="number" stroke="var(--muted)" fontSize={11} />
                        <YAxis dataKey="origin" type="category" stroke="var(--text-primary)" fontSize={12} fontWeight="bold" />
                        <RechartsTooltip
                          contentStyle={{
                            background: "var(--card)",
                            borderColor: "var(--border)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <RechartsLegend />
                        <Bar dataKey="fob" stackId="a" fill="var(--s1)" name="Costo FOB (Puerto)" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="freight" stackId="a" fill="var(--s2)" name="Flete Marítimo Estimado" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ height: "300px", background: "var(--plane)", display: "grid", placeItems: "center" }}>
                    Cargando gráfico...
                  </div>
                )}
              </div>
            </section>

            {/* BOARD BOX */}
            <section id="board">
              <div className="sec-head">
                <span className="sec-num">★</span>
                <h3 className="sec-title">¿Qué significa esto para Argos PR y Domicem?</h3>
              </div>
              <div className="grid2">
                <div className="board">
                  <h4>🏝️ Argos Puerto Rico</h4>
                  <p>{currentEdition.boardBox.argosPR}</p>
                </div>
                <div className="board">
                  <h4>🇩🇴 Domicem</h4>
                  <p>{currentEdition.boardBox.domicem}</p>
                </div>
              </div>
              <div className="board" style={{ marginTop: "14px" }}>
                <h4>🎯 Preguntas clave para el próximo consejo</h4>
                <ol className="q">
                  {currentEdition.boardBox.questions.map((q, idx) => (
                    <li key={idx}><strong>{q}</strong></li>
                  ))}
                </ol>
              </div>
            </section>

            {/* ACCORDION CONTROLS */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", marginTop: "24px" }}>
              <h4 style={{ margin: 0, fontWeight: "bold", fontSize: "15px", color: "var(--text-primary)" }}>
                📝 Secciones detalladas (Análisis semanal)
              </h4>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={expandAll}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "var(--plane)",
                    color: "var(--text-primary)",
                    fontWeight: "bold",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  ▾ Expandir todo
                </button>
                <button
                  onClick={collapseAll}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "var(--plane)",
                    color: "var(--text-primary)",
                    fontWeight: "bold",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  ▸ Colapsar todo
                </button>
              </div>
            </div>

            {/* NARRATIVE SECTIONS */}
            {currentEdition.sections.map((sec) => {
              const isExpanded = expandedSections[sec.id] === true;
              return (
                <section
                  key={sec.id}
                  id={sec.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: "12px",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    onClick={() => toggleSection(sec.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      padding: "10px 0",
                      userSelect: "none",
                    }}
                  >
                    <div className="sec-head" style={{ border: "none", margin: 0, padding: 0 }}>
                      <span className="sec-num">{sec.num}</span>
                      <h3 className="sec-title">{sec.title}</h3>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "13px", color: "var(--muted)", fontWeight: "650" }}>
                        {isExpanded ? "Ocultar" : "Mostrar"}
                      </span>
                      <span style={{ fontSize: "16px", color: "var(--muted)" }}>
                        {isExpanded ? "▾" : "▸"}
                      </span>
                    </div>
                  </div>

                  {/* Collapsable Content with smooth transition */}
                  <div
                    style={{
                      maxHeight: isExpanded ? "3000px" : "0px",
                      overflow: "hidden",
                      transition: "max-height 0.35s ease-in-out, opacity 0.3s ease-in-out",
                      opacity: isExpanded ? 1 : 0,
                    }}
                  >
                    <div className="sec-sub" style={{ marginTop: "4px", marginBottom: "12px" }}>{sec.subtitle}</div>
                    <div className="card">
                      <div className="grid2">
                        {sec.subsections.map((sub, idx) => (
                          <div key={idx} style={{ marginBottom: "12px" }}>
                            <h4>{sub.title}</h4>
                            <p>{sub.content}</p>
                            {sub.why && (
                              <div className="why">
                                <b>Caribe:</b> {sub.why.replace(/Caribe:\s*/i, "")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}

            {/* MARKET MOVES & ALERTS */}
            <section id="salerts">
              <div className="sec-head">
                <span className="sec-num" style={{ background: "var(--s2)" }}>🔔</span>
                <h3 className="sec-title">Alertas &amp; Movimientos de mercado</h3>
              </div>
              <div className="sec-sub">Línea de tiempo de eventos disruptivos e importaciones en la región.</div>

              {/* Market filters */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
                <button
                  onClick={() => setMarketMoveFilter("all")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: "1px solid var(--border)",
                    background: marketMoveFilter === "all" ? "var(--s1)" : "var(--plane)",
                    color: marketMoveFilter === "all" ? "white" : "var(--text-primary)",
                    fontWeight: "bold",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  🌐 Todos los mercados
                </button>
                {getUniqueMarkets().map((m) => (
                  <button
                    key={m}
                    onClick={() => setMarketMoveFilter(m)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "20px",
                      border: "1px solid var(--border)",
                      background: marketMoveFilter === m ? "var(--s1)" : "var(--plane)",
                      color: marketMoveFilter === m ? "white" : "var(--text-primary)",
                      fontWeight: "bold",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    📍 {m}
                  </button>
                ))}
              </div>

              <div className="card">
                {filteredMarketMoves.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", borderLeft: "2px solid var(--border)", paddingLeft: "16px", marginLeft: "8px" }}>
                    {filteredMarketMoves.map((move, idx) => (
                      <div
                        key={idx}
                        style={{
                          position: "relative",
                          padding: "14px",
                          background: "var(--plane)",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {/* Timeline dot */}
                        <div
                          style={{
                            position: "absolute",
                            left: "-25px",
                            top: "20px",
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: "var(--s1)",
                            border: "3px solid var(--card)",
                          }}
                        ></div>

                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
                          <span style={{ fontWeight: "bold", fontSize: "14px", color: "var(--s1)" }}>
                            {move.actor}
                          </span>
                          <span className="pill" style={{ margin: 0, fontWeight: "bold" }}>
                            {move.market}
                          </span>
                        </div>

                        <h4 style={{ margin: "4px 0" }}>{move.action}</h4>
                        <p style={{ fontSize: "13.5px", margin: "4px 0 8px" }}>{move.detail}</p>
                        
                        <div style={{ background: "var(--card)", padding: "10px", borderRadius: "6px", fontSize: "13px", border: "1px solid var(--border)", marginBottom: "8px" }}>
                          <strong>Impacto Argos PR / Domicem:</strong> {move.impact}
                        </div>

                        {move.url && (
                          <a href={move.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", fontWeight: "bold", color: "var(--s1)" }}>
                            🔗 Leer fuente de información
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>
                    No hay movimientos competitivos para este mercado.
                  </p>
                )}
              </div>
            </section>

            {/* NEWS LIST */}
            <section id="snews">
              <div className="sec-head">
                <span className="sec-num" style={{ background: "var(--s2)" }}>📰</span>
                <h3 className="sec-title">Noticias &amp; fuentes de la semana</h3>
              </div>
              <div className="sec-sub">Referencias que alimentan la inteligencia semanal.</div>

              {/* Category selector & Search bar & Checkboxes */}
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <label htmlFor="search-news" style={{ display: "none" }}>Buscar noticias</label>
                    <input
                      id="search-news"
                      type="text"
                      placeholder="🔍 Buscar por texto, fuente o palabra clave..."
                      value={newsSearchQuery}
                      onChange={(e) => setNewsSearchQuery(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "var(--plane)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label htmlFor="category-select" style={{ marginRight: "6px", fontWeight: 600 }}>
                      Categoría:
                    </label>
                    <select
                      id="category-select"
                      value={newsCategoryFilter}
                      onChange={(e) => setNewsCategoryFilter(e.target.value)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "var(--plane)",
                        color: "var(--text-primary)",
                        fontWeight: "bold",
                      }}
                    >
                      <option value="all">Todas las categorías</option>
                      {getNewsCategories().map((cat, idx) => (
                        <option key={idx} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Filters Row */}
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "13px", padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: "bold" }}>
                    <input
                      type="checkbox"
                      checked={searchAllEditions}
                      onChange={(e) => setSearchAllEditions(e.target.checked)}
                    />
                    📚 Buscar en todas las ediciones
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: "bold" }}>
                    <input
                      type="checkbox"
                      checked={showSavedOnly}
                      onChange={(e) => setShowSavedOnly(e.target.checked)}
                    />
                    ⭐ Ver Guardados
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: "bold" }}>
                    <input
                      type="checkbox"
                      checked={hideDuplicates}
                      onChange={(e) => setHideDuplicates(e.target.checked)}
                    />
                    🛡️ Ocultar repetidas
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: "bold" }}>
                    <input
                      type="checkbox"
                      checked={showDomicemOnly}
                      onChange={(e) => setShowDomicemOnly(e.target.checked)}
                    />
                    🇩🇴 Impacto Domicem (RD)
                  </label>
                </div>
              </div>

              {/* News cards layout */}
              <div className="card">
                {filteredNews.length > 0 ? (
                  <ul className="news-list">
                    {filteredNews.map((item, idx) => {
                      const isSaved = savedNewsUrls.includes(item.url);
                      const isNew = !isNewsDuplicate(item.url, item.editionNum);
                      return (
                        <li key={idx} style={{ padding: "12px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                              {searchAllEditions && (
                                <span className="pill" style={{ margin: 0, fontWeight: "bold", fontSize: "10px" }}>
                                  Ed. #{item.editionNum}
                                </span>
                              )}
                              {isNew && (
                                <span style={{ background: "var(--good)", color: "white", fontSize: "10px", fontWeight: "bold", padding: "1px 5px", borderRadius: "4px" }}>
                                  NUEVO
                                </span>
                              )}
                              {item.domicemImpact && (
                                <span style={{ color: "var(--s3)", border: "1px solid var(--s3)", fontSize: "10px", fontWeight: "bold", padding: "1px 5px", borderRadius: "4px" }}>
                                  Impacto RD
                                </span>
                              )}
                              <span style={{ color: "var(--s7)", fontSize: "11px", fontWeight: "bold" }}>
                                {item.category}
                              </span>
                            </div>
                            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "14px", fontWeight: "600", display: "block" }}>
                              {item.title}
                            </a>
                            <span className="meta" style={{ marginTop: "4px" }}>
                              <b>{item.source}</b> {item.date && `· ${item.date}`}
                            </span>
                          </div>

                          {/* Save/Unsave Button */}
                          <button
                            onClick={() => toggleSaveNews(item.url)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              background: isSaved ? "rgba(235, 104, 52, 0.12)" : "var(--plane)",
                              color: isSaved ? "var(--s2)" : "var(--text-secondary)",
                              fontSize: "12px",
                              fontWeight: "bold",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span>{isSaved ? "⭐" : "☆"}</span>
                            <span>{isSaved ? "Quitar" : "Guardar"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>
                    No se encontraron noticias que coincidan con la búsqueda.
                  </p>
                )}
              </div>
            </section>


            {/* ADJUSTS & WATCHLIST SETTINGS */}
            <section id="sadjust">
              <div className="sec-head">
                <span className="sec-num" style={{ background: "var(--s7)" }}>⚙️</span>
                <h3 className="sec-title">Ajustes &amp; Watchlist</h3>
              </div>
              <div className="sec-sub">Configuración de umbrales y seguimiento personalizado.</div>

              <div className="card">
                <h4 style={{ marginBottom: "12px" }}>Alertas e Indicadores de Seguimiento</h4>
                
                <div style={{ marginBottom: "16px" }}>
                  <label htmlFor="brent-alarm" style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>
                    Alarma de precio del Crudo Brent (USD/bbl):
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      id="brent-alarm"
                      type="number"
                      value={brentThreshold}
                      onChange={(e) => setBrentThreshold(parseFloat(e.target.value) || 0)}
                      style={{
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "var(--plane)",
                        color: "var(--text-primary)",
                        width: "100px",
                        fontWeight: "bold",
                      }}
                    />
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                      Notificar cuando el Brent supere este precio (Valor actual: US$
                      {currentEdition.priceBoard.find((r) => r.indicator === "Brent")?.numeric || 0})
                    </span>
                  </div>
                </div>

                <div>
                  <h5 style={{ fontWeight: "bold", marginBottom: "8px" }}>Watchlist de Indicadores</h5>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {["Brent", "Clinker CIF Caribe", "Petcoke FOB USGC (fuel-grade)", "Handysize (BHSI) — clase clave clinker", "USD/TRY (lira turca)"].map((indName) => {
                      const isChecked = watchlist.includes(indName);
                      return (
                        <label key={indName} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13.5px" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setWatchlist(watchlist.filter((w) => w !== indName));
                              } else {
                                setWatchlist([...watchlist, indName]);
                              }
                            }}
                          />
                          <span>{indName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>

        {/* ---------- FOOTER ---------- */}
        <footer className="footer">
          <p>© 2026 Cement Intelligence System · Preparado para Argos Puerto Rico & Domicem. Todos los derechos reservados.</p>
          <p style={{ marginTop: "4px" }}>
            Desarrollado en Next.js + React. Cumple con la especificación del contrato de datos. PWA Instalable.
          </p>
        </footer>
      </div>
    </div>
  );
}
