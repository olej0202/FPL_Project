import { Activity, Clock3, Footprints, Hand, Shield, Sparkles, Star, CircleDot } from "lucide-react";

export const PALETTE = {
  red: "#f8fafc",
  gold: "#76AFA0",
  black: "#e2e8f0",
  beige: "#1e293b",
  border: "rgba(148,163,184,0.35)",
  muted: "#64748b",
};

export const POSITION_ORDER = {
  GK: 0,
  GKP: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
  FOR: 3,
};

export const POINTS_RULES = {
  GKP: { goal: 6, assist: 3, cs: 4, start: 2 },
  GK: { goal: 6, assist: 3, cs: 4, start: 2 },
  DEF: { goal: 6, assist: 3, cs: 4, start: 1 },
  MID: { goal: 5, assist: 3, cs: 1, start: 2 },
  FWD: { goal: 4, assist: 3, cs: 0, start: 2 },
  FOR: { goal: 4, assist: 3, cs: 0, start: 2 },
};

export const STACK_MEASURE_SERIES = [
  { key: "base", label: "Base", color: "#475569" },
  { key: "goal", label: "Goal", color: "#2563eb" },
  { key: "assist", label: "Assist", color: "#0f766e" },
  { key: "bonus", label: "Bonus", color: "#d97706" },
  { key: "defcon", label: "Defcon", color: "#7c3aed" },
  { key: "cs", label: "CS", color: "#059669" },
  { key: "card", label: "Card", color: "#dc2626" },
];

export const STACK_TOTAL_SERIES = {
  key: "componentTotal",
  label: "Total",
  color: "#0f172a",
};

export const MEASURE_OPTIONS = [
  {
    value: "Points_prediction",
    label: "Points",
    description: "Predicted Points",
    icon: Star,
    format: (n) => n.toFixed(2),
  },
  {
    value: "Goal_pred",
    label: "Goals",
    description: "Predicted Goals",
    icon: CircleDot,
    format: (n) => n.toFixed(2),
  },
  {
    value: "Assist_pred",
    label: "Assist",
    description: "Predicted Assists",
    icon: Footprints,
    format: (n) => n.toFixed(2),
  },
  {
    value: "Bonus_pred",
    label: "Bonus",
    description: "Predicted Bonus",
    icon: Sparkles,
    format: (n) => n.toFixed(2),
  },
  {
    value: "GC_pred",
    label: "CS",
    description: "Predicted Clean Sheets",
    icon: Shield,
    format: (n) => n.toFixed(2),
  },
  {
    value: "CBI_pred",
    label: "Defcon %",
    description: "Predicted Defcon",
    icon: Activity,
    format: (n) => n.toFixed(2),
  },
  {
    value: "average_minutes",
    label: "Minutes",
    description: "Predicted Minutes",
    icon: Clock3,
    format: (n) => n.toFixed(1),
  },
  {
    value: "Save_pred",
    label: "Save Points",
    description: "Predicted Save Points",
    icon: Hand,
    format: (n) => n.toFixed(2),
  },
];

export function firstFinite(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

export function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

export function toNum(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function teamKeyVariants(value) {
  const base = String(value ?? "").trim();
  if (!base) return [];
  const variants = new Set([norm(base)]);
  const asNum = Number(base);
  if (Number.isFinite(asNum)) {
    variants.add(norm(String(asNum)));
    variants.add(norm(String(Math.trunc(asNum))));
  }
  return Array.from(variants).filter(Boolean);
}

export function clampRange(range, min, max) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const low = Number(range?.[0]);
  const high = Number(range?.[1]);
  const start = Number.isFinite(low) ? Math.max(safeMin, Math.min(safeMax, low)) : safeMin;
  const end = Number.isFinite(high) ? Math.max(safeMin, Math.min(safeMax, high)) : safeMax;
  return [Math.min(start, end), Math.max(start, end)];
}

export function getMeasureMeta(measure) {
  return MEASURE_OPTIONS.find((option) => option.value === measure) || MEASURE_OPTIONS[0];
}

export function getPlayerKey(row) {
  const id = row?.id ?? row?.element ?? row?.code ?? row?.name ?? row?.web_name;
  const teamCode = row?.team_code ?? row?.Team ?? "";
  return `${String(id)}__${String(teamCode)}`;
}

export function getMeasureValue(row, measure) {
  switch (measure) {
    case "Points_prediction":
      return firstFinite(row?.Points_prediction, row?.Point_prediction);
    case "Goal_pred":
      return firstFinite(row?.Goal_pred);
    case "Assist_pred":
      return firstFinite(row?.Assist_pred);
    case "Bonus_pred":
      return firstFinite(row?.Bonus_pred, row?.Bonus_pred2);
    case "GC_pred":
      return firstFinite(row?.GC_pred);
    case "CBI_pred":
      return firstFinite(row?.CBI_pred, row?.DefCon);
    case "average_minutes":
      return firstFinite(row?.average_minutes);
    case "Save_pred":
      return firstFinite(row?.Save_pred);
    case "Card_pred":
      return firstFinite(row?.Card_pred);
    default:
      return 0;
  }
}

export function getPointRules(position) {
  const key = String(position || "").toUpperCase();
  return POINTS_RULES[key] || POINTS_RULES.DEF;
}

export function getCanonicalPosition(position) {
  const key = String(position || "").toUpperCase();
  if (key === "GK") return "GKP";
  if (key === "FOR") return "FWD";
  return key || "DEF";
}

export function getMinuteLikelihoods(minutes) {
  const predictionMinutes = Math.max(0, firstFinite(minutes));
  const z60 = -3.045855 + 0.056203 * predictionMinutes;
  const z0 = -1.855427 + 0.056741 * predictionMinutes;
  return {
    predictionMinutes,
    likelihoodOf60: 1 / (1 + Math.exp(-z60)),
    likelihoodOf0: 1 / (1 + Math.exp(-z0)),
  };
}

export function computeGoalsConcededCurve(gcPred, scale = 1) {
  const safeGcPred = Math.max(Math.max(0, gcPred), 1e-9);
  return (
    0.5 *
    scale *
    (((30 - Math.min(30, safeGcPred * 100)) / -15) -
      (1 - safeGcPred * (1 - Math.log(safeGcPred))))
  );
}

export function computePointBreakdown(row) {
  const position = getCanonicalPosition(row?.position);
  const rules = getPointRules(position);
  const { predictionMinutes, likelihoodOf60, likelihoodOf0 } = getMinuteLikelihoods(
    row?.average_minutes
  );
  const goalPred = firstFinite(row?.Goal_pred);
  const assistPred = firstFinite(row?.Assist_pred);
  const bonusPred = firstFinite(row?.Bonus_pred, row?.Bonus_pred2);
  const gcPred = Math.max(0, firstFinite(row?.GC_pred));
  const cardPred = firstFinite(row?.Card_pred);
  const cbiPred = firstFinite(row?.CBI_pred, row?.DefCon);
  const savePred = firstFinite(row?.Save_pred);

  const base = likelihoodOf60 + likelihoodOf0;
  let goal = 0;
  let assist = 0;
  let defcon = 0;
  let cs = 0;
  let card = 0;

  if (position === "FWD") {
    goal = goalPred * rules.goal;
    assist = assistPred * rules.assist;
    defcon = cbiPred * 2;
    card = -cardPred;
  } else if (position === "MID") {
    goal = goalPred * rules.goal;
    assist = assistPred * rules.assist;
    defcon = cbiPred * 2;
    cs = gcPred * rules.cs * likelihoodOf60;
    card = -cardPred;
  } else if (position === "GKP") {
    cs =
      savePred +
      computeGoalsConcededCurve(gcPred) +
      gcPred * rules.cs * likelihoodOf60;
  } else {
    goal = goalPred * rules.goal;
    assist = assistPred * rules.assist;
    defcon = cbiPred * 2;
    cs =
      gcPred * rules.cs * likelihoodOf60 +
      computeGoalsConcededCurve(gcPred, predictionMinutes / 90);
    card = -cardPred;
  }

  const componentTotal = base + goal + assist + bonusPred + defcon + cs + card;

  return {
    base,
    goal,
    assist,
    bonus: bonusPred,
    defcon,
    cs,
    card,
    pointsPrediction: firstFinite(row?.Points_prediction, row?.Point_prediction, componentTotal),
    componentTotal,
  };
}

export function buildPointBreakdownRow(rawRows, gw, fixtureDetail, fallbackTeamName = "") {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const totals = {
    base: 0,
    goal: 0,
    assist: 0,
    bonus: 0,
    defcon: 0,
    cs: 0,
    card: 0,
    pointsPrediction: 0,
    minutes: 0,
  };

  for (const row of rows) {
    const breakdown = computePointBreakdown(row);
    totals.base += breakdown.base;
    totals.goal += breakdown.goal;
    totals.assist += breakdown.assist;
    totals.bonus += breakdown.bonus;
    totals.defcon += breakdown.defcon;
    totals.cs += breakdown.cs;
    totals.card += breakdown.card;
    totals.pointsPrediction += breakdown.pointsPrediction;
    totals.minutes += firstFinite(row?.average_minutes);
  }

  return {
    gw,
    label: `GW ${gw}`,
    fixId: fixtureDetail?.fixId || "-",
    teamName: fixtureDetail?.teamName || fallbackTeamName,
    opponent: fixtureDetail?.opponent || "",
    venue: fixtureDetail?.venue || "",
    base: totals.base,
    goal: totals.goal,
    assist: totals.assist,
    bonus: totals.bonus,
    defcon: totals.defcon,
    cs: totals.cs,
    card: totals.card,
    pointsPrediction: totals.pointsPrediction,
    componentTotal:
      totals.base +
      totals.goal +
      totals.assist +
      totals.bonus +
      totals.defcon +
      totals.cs +
      totals.card,
    minutes: totals.minutes,
  };
}

export function ownershipPercent(row) {
  const raw = firstFinite(
    row?.selected_pct,
    row?.selected_by_percent,
    row?.ownership,
    row?.selected
  );
  if (!Number.isFinite(raw)) return 0;
  return raw <= 1 ? raw * 100 : raw;
}

export function formatHAV(home) {
  if (home === true || home === "Home" || home === "H") return "H";
  if (home === false || home === "Away" || home === "A") return "A";
  return "-";
}

export function formatPrice(value) {
  return `\u00A3${Number(value || 0).toFixed(1)}`;
}

export function getRowTeamName(row, teamNamesByCode) {
  const code = row?.team_code ?? row?.Team ?? row?.team_id ?? row?.code;
  return firstText(
    row?.team_name,
    row?.team,
    row?.Team,
    code != null ? teamNamesByCode.get(String(code)) : "",
    code
  );
}

export function getTeamCandidates(row, teamName = "") {
  const values = [
    teamName,
    row?.team_name,
    row?.team,
    row?.Team,
    row?.team_code,
    row?.team_id,
    row?.code,
  ];
  const set = new Set();
  for (const value of values) {
    for (const variant of teamKeyVariants(value)) {
      set.add(variant);
    }
  }
  return set;
}

export function buildFixtureMetaById(fixtures) {
  const map = new Map();

  for (const row of fixtures || []) {
    const fixId = firstText(row?.fix_id, row?.fixture_id, row?.id);
    if (!fixId) continue;

    const key = String(fixId);
    if (!map.has(key)) {
      map.set(key, { rows: [], teams: [] });
    }

    const entry = map.get(key);
    entry.rows.push(row);

    const teamName = firstText(row?.team_name, row?.name, row?.Team, row?.team);
    const teamCode = firstText(row?.team_code, row?.team_id, row?.code);
    const opponent = firstText(
      row?.opponent_name,
      row?.Opponent_team,
      row?.opponent_team,
      row?.Opponent,
      row?.opponent
    );

    const teamEntry = {
      name: teamName,
      code: teamCode,
      opponent,
      venue: formatHAV(row?.Home ?? row?.home ?? row?.Venue),
    };

    const existing = entry.teams.find(
      (item) => norm(item.name) === norm(teamEntry.name) && norm(item.code) === norm(teamEntry.code)
    );
    if (!existing) {
      entry.teams.push(teamEntry);
    }
  }

  return map;
}

export function resolveFixtureDetail(playerRow, gwDetail, fixtureMetaById, teamNamesByCode) {
  const rows = Array.isArray(gwDetail?.rawRows) && gwDetail.rawRows.length ? gwDetail.rawRows : [playerRow];
  const teamName = getRowTeamName(playerRow, teamNamesByCode);
  const details = [];

  for (const row of rows) {
    if (!row) continue;

    const fixPercentage = toNum(row?.fix_percentage, null);
    if (fixPercentage === 0) continue;

    const fixId = firstText(row?.fix_id, row?.fixture_id, gwDetail?.fixId, playerRow?.fix_id, playerRow?.fixture_id);
    const meta = fixId ? fixtureMetaById.get(String(fixId)) : null;
    const rowTeamName = getRowTeamName(row, teamNamesByCode) || teamName;
    const playerCandidates = getTeamCandidates(row, rowTeamName);

    let opponent = firstText(
      row?.opponent_name,
      row?.Opponent_team,
      row?.opponent_team,
      row?.Opponent,
      row?.opponent
    );
    let venue = formatHAV(row?.Home ?? row?.home ?? row?.Venue);

    if (meta?.teams?.length) {
      const matchingTeam = meta.teams.find((team) => {
        const candidates = new Set([
          ...teamKeyVariants(team?.name),
          ...teamKeyVariants(team?.code),
        ]);
        return Array.from(candidates).some((candidate) => playerCandidates.has(candidate));
      });

      const otherTeam = meta.teams.find((team) => {
        const candidates = new Set([
          ...teamKeyVariants(team?.name),
          ...teamKeyVariants(team?.code),
        ]);
        return !Array.from(candidates).some((candidate) => playerCandidates.has(candidate));
      });

      if (matchingTeam) {
        opponent = firstText(matchingTeam.opponent, otherTeam?.name, otherTeam?.code, opponent);
        venue = matchingTeam.venue || venue;
      } else if (otherTeam) {
        opponent = firstText(otherTeam.name, otherTeam.code, opponent);
      }
    }

    details.push({
      fixId: fixId || "-",
      opponent: opponent || "",
      venue: venue || "",
      teamName: rowTeamName || teamName || "-",
    });
  }

  const unique = [];
  for (const detail of details) {
    const key = `${detail.fixId}__${detail.opponent}__${detail.venue}`;
    if (!unique.some((item) => `${item.fixId}__${item.opponent}__${item.venue}` === key)) {
      unique.push(detail);
    }
  }

  return {
    fixId: unique.map((item) => item.fixId).filter(Boolean).join(" / ") || "-",
    teamName: unique[0]?.teamName || teamName || "-",
    opponent: unique.map((item) => item.opponent).filter(Boolean).join(" / "),
    venue: unique.map((item) => item.venue).filter(Boolean).join(" / "),
  };
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
