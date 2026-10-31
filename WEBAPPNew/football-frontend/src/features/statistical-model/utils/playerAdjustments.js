import { Shield, Sparkles, Clock3, Activity, Star, CircleDot, Footprints, Hand } from "lucide-react";

export const PALETTE = {
  red: "#f8fafc",
  gold: "#76AFA0",
  goldSoft: "#A7D0C4",
  black: "#e2e8f0",
  beige: "#1e293b",
  border: "rgba(148,163,184,0.35)",
  muted: "#64748b",
  success: "#86efac",
  danger: "#f87171",
};

export const FILTERS_STORAGE_KEY = "player_adjustments_filters_v8";

export const MIN_MINUTES = 0;

export const MAX_MINUTES = 90;

export const MEASURE_LABELS = {
  Points: "Predicted Points",
  Goal_Scored: "Predicted Goals",
  Assists: "Predicted Assists",
  Bonus_Pred: "Predicted Bonus",
  Avg_Minutes: "Predicted Minutes",
  CBI_Predictions: "Predicted Defcon",
  Save_Pred: "Predicted Saves",
};

export const MODAL_METRIC_OPTIONS = [
  { value: "points", label: "Points" },
  { value: "goals", label: "Goals" },
  { value: "assists", label: "Assists" },
  { value: "bonus", label: "Bonus" },
  { value: "saves", label: "Saves" },
  { value: "defcon", label: "Defcon" },
];

export const BREAKDOWN_SERIES = [
  { key: "base", label: "Base", color: "#475569" },
  { key: "goal", label: "Goal", color: "#2563eb" },
  { key: "assist", label: "Assist", color: "#0f766e" },
  { key: "defcon", label: "Defcon", color: "#7c3aed" },
  { key: "cs", label: "CS", color: "#059669" },
  { key: "bonus", label: "Bonus", color: "#d97706" },
  { key: "card", label: "Cards", color: "#dc2626" },
  { key: "gc", label: "GC Penalty", color: "#9333ea" },
];

export const BREAKDOWN_TOTAL_SERIES = {
  key: "total",
  label: "Total",
  color: "#0f172a",
};

export const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

export const parseOptional01 = (value) => {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? clamp01(n) : null;
};

export const scaleRawCbiByAdjustedMean = (raw01, sourceMean01, adjustedMean01) => {
  const raw = clamp01(raw01);
  const sourceMean = clamp01(sourceMean01);
  const adjustedMean = clamp01(adjustedMean01);
  if (sourceMean > 1e-9) return clamp01(raw * (adjustedMean / sourceMean));
  return adjustedMean;
};

export function getMeasureMeta(measure) {
  switch (measure) {
    case "Points":
      return { label: MEASURE_LABELS.Points, icon: Star, short: "Points", emoji: "\u2B50" };
    case "Goal_Scored":
      return { label: MEASURE_LABELS.Goal_Scored, icon: CircleDot, short: "Goals", emoji: "\u26BD" };
    case "Assists":
      return { label: MEASURE_LABELS.Assists, icon: Footprints, short: "Assists", emoji: "\uD83E\uDD7E" };
    case "Bonus_Pred":
      return { label: MEASURE_LABELS.Bonus_Pred, icon: Sparkles, short: "Bonus", emoji: "\u2728" };
    case "Avg_Minutes":
      return { label: MEASURE_LABELS.Avg_Minutes, icon: Clock3, short: "Minutes", emoji: "\uD83D\uDD52" };
    case "CBI_Predictions":
      return { label: MEASURE_LABELS.CBI_Predictions, icon: Shield, short: "Defcon", emoji: "\uD83D\uDEE1\uFE0F" };
    case "Save_Pred":
      return { label: MEASURE_LABELS.Save_Pred, icon: Hand, short: "Saves", emoji: "\uD83E\uDDE4" };
    default:
      return { label: measure, icon: Activity, short: measure, emoji: "\u2022" };
  }
}

export function getBarRange(values) {
  const finiteValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return { min: 0, max: 0 };
  }

  return {
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues),
  };
}

export function getBarIntensity(value, range) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || !range) return 0;

  const maxValue = Number(range.max);
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, numericValue / maxValue));
}

export function playersNeedCalcSync(currentRows, nextRows) {
  if (!Array.isArray(currentRows) || !Array.isArray(nextRows)) return true;
  if (currentRows.length !== nextRows.length) return true;

  for (let i = 0; i < nextRows.length; i++) {
    const a = currentRows[i];
    const b = nextRows[i];
    if (!a || !b) return true;

    if (
      Number(a.calc_points) !== Number(b.calc_points) ||
      Number(a.calc_goals) !== Number(b.calc_goals) ||
      Number(a.calc_assists) !== Number(b.calc_assists) ||
      Number(a.calc_minutes) !== Number(b.calc_minutes) ||
      Number(a.calc_cbi) !== Number(b.calc_cbi) ||
      Number(a.calc_saves) !== Number(b.calc_saves)
    ) {
      return true;
    }
  }

  return false;
}
