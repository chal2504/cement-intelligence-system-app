import fs from "fs";
import path from "path";

export interface Delta {
  dir: "up" | "down" | "flat" | "nd";
  sentiment: "favorable" | "adverse" | "neutral";
  label: string;
}

export interface PriceRow {
  group: string;
  indicator: string;
  value: string;
  numeric: number | null;
  est: boolean;
  week: Delta;
  month: Delta;
  year: Delta;
  reference: string;
}

export interface RiskItem {
  title: string;
  description: string;
}

export interface NarrativeSubsection {
  title: string;
  content: string;
  why: string;
}

export interface NarrativeSection {
  id: string;
  num: number;
  title: string;
  subtitle: string;
  subsections: NarrativeSubsection[];
}

export interface NewsItem {
  category: string;
  title: string;
  source: string;
  date: string;
  url: string;
  domicemImpact: boolean;
}

export interface LandedCostOrigin {
  origin: string;
  fob: number;
  freight: number;
  total: number;
}

export interface EditionData {
  meta: {
    edition: number;
    week: string;
    dates: string;
    timestamp: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    lede: string;
    stamp: string;
  };
  executiveSummary: {
    title: string;
    category: "cost" | "demand" | "competition" | "regulation" | "opportunity";
    categoryLabel: string;
    description: string;
  }[];
  risks: {
    critical: RiskItem[];
    emerging: RiskItem[];
    opportunities: RiskItem[];
  };
  priceBoard: PriceRow[];
  landedCostChart: {
    origins: LandedCostOrigin[];
  };
  boardBox: {
    argosPR: string;
    domicem: string;
    questions: string[];
  };
  sections: NarrativeSection[];
  news: NewsItem[];
  marketMoves: MarketMovesItem[];
}

export interface MarketMovesItem {
  actor: string;
  action: string;
  market: string;
  detail: string;
  impact: string;
  url: string;
}

export function getAllEditions(): EditionData[] {
  const editionsDir = path.join(process.cwd(), "data", "editions");
  if (!fs.existsSync(editionsDir)) {
    return [];
  }
  const filenames = fs.readdirSync(editionsDir);
  const editions: EditionData[] = [];

  for (const filename of filenames) {
    if (filename.endsWith(".json")) {
      const filePath = path.join(editionsDir, filename);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content) as EditionData;
        editions.push(parsed);
      } catch (err) {
        console.error(`Error reading or parsing ${filename}:`, err);
      }
    }
  }

  // Sort by edition number ascending
  return editions.sort((a, b) => a.meta.edition - b.meta.edition);
}

export function getLatestEdition(): EditionData | null {
  const editions = getAllEditions();
  return editions.length > 0 ? editions[editions.length - 1] : null;
}

export function getEditionByNumber(num: number): EditionData | null {
  const editions = getAllEditions();
  return editions.find((e) => e.meta.edition === num) || null;
}

// ---------- Pulso diario (data/daily/pulse.json) ----------
export interface DailyPulseIndicator {
  label: string;
  value: string;
  delta: string;
  sentiment: "favorable" | "adverse" | "neutral";
}

export interface DailyPulseBreaking {
  title: string;
  detail: string;
  url: string;
}

export interface DailyPulse {
  updated: string;
  updatedLabel: string;
  indicators: DailyPulseIndicator[];
  breaking: DailyPulseBreaking | null;
}

export function getDailyPulse(): DailyPulse | null {
  const pulsePath = path.join(process.cwd(), "data", "daily", "pulse.json");
  if (!fs.existsSync(pulsePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(pulsePath, "utf-8");
    return JSON.parse(content) as DailyPulse;
  } catch (err) {
    console.error("Error reading or parsing pulse.json:", err);
    return null;
  }
}
