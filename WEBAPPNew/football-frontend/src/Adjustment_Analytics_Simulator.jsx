import React, { useEffect, useMemo, useState } from "react";
import { PlayCircle } from "lucide-react";
import { useAdjustmentData, fixtureIdFromRow } from "./Contexts/AdjustmentsContext";
import teamLogos from "./utils/team_logos";

const toNum = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const firstNum = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const firstText = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

const normalizeTeamKey = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
const isValidGW = (gw) => Number.isInteger(gw) && gw >= 1 && gw <= 38;

const teamKeyVariants = (value) => {
  const base = String(value ?? "").trim();
  if (!base) return [];
  const out = new Set([normalizeTeamKey(base)]);
  const asNum = Number(base);
  if (Number.isFinite(asNum)) {
    out.add(normalizeTeamKey(String(asNum)));
    out.add(normalizeTeamKey(String(Math.trunc(asNum))));
  }
  return Array.from(out).filter(Boolean);
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));
const pct = (n, d) => (d > 0 ? (n / d) * 100 : 0);

// --- Detailed simulator constants (aligned with GenerateMatchSimulations.py) ---
const ATTACK_TURNS_BASE = 10.0;
const ATTACK_TURNS_MIN = 6;
const ATTACK_TURNS_MAX = 18;
const ATTACK_STRENGTH_EXP = 1.06;
const ATTACK_HOME_SHIFT = 0.4;
const ATTACKS_NOISE_STD = 1.15;

const DEF_STOP_BASE = 0.33;
const DEF_STOP_SCALE = 0.24;
const DEF_STOP_MIN = 0.2;
const DEF_STOP_MAX = 0.5;

const TEAM_SHOCK_STD_MIN = 0.03;
const TEAM_SHOCK_STD_MAX = 0.32;
const GOAL_PROB_MIN = 0.06;
const GOAL_PROB_MAX = 0.5;
const GOAL_FINISH_SHARE_BOOST = 0.32;
const TEMPO_SHOCK_STD = 0.08;
const SIM_ITERATIONS = 3000;

const isHomeFlag = (v) => v === "H" || v === "Home" || v === true;

// Team prediction formula copied from Adjustment_Analytics_Team.jsx (recomputeMetrics).
const predictTeamFromAdjustmentFormula = (row) => {
  const ownXG = Number(row?.own_XG_avg ?? 0);
  const ownXGC = Number(row?.own_XGC_avg ?? 0);
  const oppXG = Number(row?.opponent_XG_avg ?? 0);
  const oppXGC = Number(row?.opponent_XGC_avg ?? 0);
  const ownAttE = Number(row?.own_H_Att_E ?? 0) * 0.6;
  const oppDefE = Number(row?.opponent_H_def_E ?? 0) * 0.6;
  const ownDEFE = Number(row?.own_H_def_E ?? 0) * 0.6;
  const oppATTE = Number(row?.opponent_H_Att_E ?? 0) * 0.6;
  const isHome = isHomeFlag(row?.Home);

  let A = 0;
  let B = 0;
  if (isHome) {
    A = ownXG + ownAttE;
    B = oppXGC - oppDefE;
  } else {
    A = ownXG - ownAttE;
    B = oppXGC + oppDefE;
  }
  const xg = Math.exp(0.5 * (-3.15 + 1.485 * A + 1.503 * B - 0.174 * A * B));

  const alpha = 0.00000009;
  if (isHome) {
    A = ownXGC + ownDEFE;
    B = oppXG - oppATTE;
  } else {
    A = ownXGC - ownDEFE;
    B = oppXG + oppATTE;
  }
  const eta = -1.56 + 0.746 * A + 0.73 * B - 0.079 * A * B;
  const mu = Math.exp(eta);
  const csProb = alpha < 1e-6 ? Math.exp(-mu) : Math.pow(1 / (1 + alpha * mu), 1 / alpha);

  return {
    xg: clamp(xg, 0.1, 4.8),
    cs: clamp(csProb, 0.03, 0.97),
  };
};

// n_attacks depends only on team XG result (+ small venue effect).
const attacksFromXg = (xg, isHomeTeam) => {
  const norm = clamp((Number(xg) - 0.6) / 1.8, 0, 1);
  const base = ATTACK_TURNS_MIN + norm * (ATTACK_TURNS_MAX - ATTACK_TURNS_MIN);
  const venue = isHomeTeam ? 0.35 : -0.15;
  return clamp(base + venue, ATTACK_TURNS_MIN, ATTACK_TURNS_MAX);
};

// defensive stop% depends only on own CS odds (+ small venue effect).
const defensiveStopFromCs = (csOdds, isHomeDefending) => {
  const norm = clamp((Number(csOdds) - 0.03) / 0.94, 0, 1);
  const base = DEF_STOP_MIN + norm * (DEF_STOP_MAX - DEF_STOP_MIN);
  const venue = isHomeDefending ? 0.015 : -0.015;
  return clamp(base + venue, DEF_STOP_MIN, DEF_STOP_MAX);
};

const createRng = (seed) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const samplePoisson = (lambda, rng) => {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > L && k < 40);
  return k - 1;
};

const sampleNormal = (rng, mean = 0, std = 1) => {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z0;
};

const teamAttackRatio = (row) => {
  const ownXgAvg = Math.max(0.2, firstNum(row?.own_XG_avg, row?.XG_avg, row?.XG, 1.25) ?? 1.25);
  return clamp(Math.pow(ownXgAvg / 1.35, 0.8), 0.62, 1.62);
};

const teamAttackStyle = (row) => {
  const attEdge = firstNum(row?.own_H_Att_E, row?.H_Att_E, row?.attack_edge, 0) ?? 0;
  const winPct = clamp((firstNum(row?.Win_Percent, row?.Home_win_Percent, 45) ?? 45) / 100, 0.1, 0.9);
  const lossPct = clamp((firstNum(row?.Loss_percent, row?.Away_win_Percent, 30) ?? 30) / 100, 0.05, 0.8);
  const momentum = clamp(1 + (winPct - lossPct) * 0.28, 0.86, 1.16);
  return clamp(Math.exp(attEdge) * momentum, 0.78, 1.34);
};

const teamDefVulnerability = (row) => {
  const xgc = Math.max(0.15, firstNum(row?.XGC, row?.XGCA, row?.Opposition_XG, 1.3) ?? 1.3);
  const ownXgcAvg = Math.max(0.15, firstNum(row?.own_XGC_avg, row?.XGC_avg, xgc) ?? xgc);
  return clamp(Math.pow(xgc / ownXgcAvg, 0.58), 0.78, 1.3);
};

// Opponent defence scalar for lambda:
// lower opp own_XGC_avg (strong defence) => lower scoring multiplier.
const oppDefLambdaMult = (oppRow) => {
  const oppOwnXgcAvg = Math.max(0.2, firstNum(oppRow?.own_XGC_avg, oppRow?.XGC_avg, oppRow?.XGC, 1.3) ?? 1.3);
  return clamp(Math.pow(oppOwnXgcAvg / 1.3, 0.42), 0.72, 1.22);
};

const teamElo = (row) => {
  const explicit = toNum(row?.Elo_Rating, toNum(row?.elo, null));
  if (Number.isFinite(explicit)) return explicit;
  const win = firstNum(row?.Win_Percent, row?.Home_win_Percent, 45) ?? 45;
  const loss = firstNum(row?.Loss_percent, row?.Away_win_Percent, 30) ?? 30;
  const draw = firstNum(row?.Draw_percent, row?.Draw_Percent, 25) ?? 25;
  return 1000 + (win - loss) * 5 + (draw - 25) * 1.5;
};

// Team attacks formula: depends only on attacking team strength (+ small home/away shift)
const offensiveTurnMean = (teamRow, isHome) => {
  const ratio = teamAttackRatio(teamRow);
  const attEdge = firstNum(teamRow?.own_H_Att_E, teamRow?.Own_Attacking_form, 0) ?? 0;
  const formAttack = clamp(Math.exp(attEdge), 0.72, 1.35);
  const style = teamAttackStyle(teamRow);
  const ownXgAvg = Math.max(0.2, firstNum(teamRow?.own_XG_avg, teamRow?.XG_avg, teamRow?.XG, 1.2) ?? 1.2);
  const trend = clamp(Math.pow(ownXgAvg / 1.35, 0.2), 0.88, 1.14);
  const ownElo = teamElo(teamRow);
  const eloMult = clamp(Math.exp((ownElo - 1000) / 3200), 0.93, 1.1);

  const strength =
    Math.exp(
      0.5 * Math.log(Math.max(0.35, ratio)) +
        0.2 * Math.log(Math.max(0.55, formAttack)) +
        0.3 * Math.log(Math.max(0.6, style))
    ) *
    trend *
    eloMult;

  let turns = ATTACK_TURNS_BASE * Math.pow(clamp(strength, 0.55, 1.75), ATTACK_STRENGTH_EXP);
  if (isHome) turns += ATTACK_HOME_SHIFT;
  return clamp(turns, ATTACK_TURNS_MIN, ATTACK_TURNS_MAX);
};

// Team defence formula: depends only on own defensive strength (+ home/away effect)
const defensiveStopProb = (defRow, isHomeDefending) => {
  const ownXgc = Math.max(
    0.15,
    firstNum(
      isHomeDefending ? defRow?.XGCH : defRow?.XGCA,
      defRow?.XGC,
      defRow?.Opposition_XG,
      defRow?.own_XGC_avg,
      1.3
    ) ?? 1.3
  );
  const ownXgcAvg = Math.max(0.15, firstNum(defRow?.own_XGC_avg, defRow?.XGC_avg, ownXgc) ?? ownXgc);
  const defQuality = clamp(1.35 / ownXgcAvg, 0.72, 1.7);

  const defEdge = firstNum(defRow?.own_H_def_E, defRow?.H_def_E, 0) ?? 0;
  const csBase = clamp(firstNum(defRow?.CS, defRow?.Clean_Sheet, 0.3) ?? 0.3, 0.03, 0.97);
  const formDef = clamp(Math.exp(-defEdge), 0.72, 1.34);
  const vulnInv = clamp(1 / teamDefVulnerability(defRow), 0.76, 1.32);
  const ownElo = teamElo(defRow);
  const eloMult = clamp(Math.exp((ownElo - 1000) / 3200), 0.93, 1.1);
  const venueAdj = isHomeDefending ? 0.03 : -0.03;

  const quality =
    Math.exp(
      0.56 * Math.log(Math.max(0.45, defQuality)) +
        0.22 * Math.log(Math.max(0.55, formDef)) +
        0.12 * Math.log(Math.max(0.55, vulnInv)) +
        0.1 * Math.log(Math.max(0.55, 0.88 + 0.34 * csBase))
    ) * eloMult;

  return clamp(DEF_STOP_BASE + DEF_STOP_SCALE * (quality - 1) + venueAdj, DEF_STOP_MIN, DEF_STOP_MAX);
};

const cappedOverscore = (player) => clamp(firstNum(player?.overscoreCap, player?.Average_Overscore, 1) ?? 1, 0.9, 1.15);

// Player goal pool formula: weighted avg of capped(Average_Overscore)/2
const weightedTeamFinishProb = (players, goalWeightKey = "goalWeight") => {
  if (!Array.isArray(players) || !players.length) return 0.5;
  let total = 0;
  for (const p of players) total += Math.max(0, toNum(p?.[goalWeightKey], 0) ?? 0);
  if (total <= 0) return 0.5;
  let weighted = 0;
  for (const p of players) {
    const w = Math.max(0, toNum(p?.[goalWeightKey], 0) ?? 0) / total;
    weighted += w * (cappedOverscore(p) / 2);
  }
  return clamp(weighted, 0.4, 0.58);
};

// Team goal scaling formula: calibrates attack engine to team target lambda
const teamGoalScale = (targetLambda, attacks, stopProb, avgFinishProb) => {
  const denom = Math.max(0.2, attacks * (1 - stopProb) * (1 - stopProb) * Math.max(0.1, avgFinishProb));
  return clamp(targetLambda / denom, 0.35, 2.3);
};

// Player per-shot goal formula
const shotGoalProbability = (player, shooterShare, goalScale) => {
  const baseFinish = cappedOverscore(player) / 2;
  const finishMult = clamp(0.82 + GOAL_FINISH_SHARE_BOOST * Math.sqrt(Math.max(0, shooterShare)), 0.72, 1.34);
  return clamp(baseFinish * goalScale * finishMult, GOAL_PROB_MIN, GOAL_PROB_MAX);
};

const pickWeighted = (rows, key, rng, excludeName = null) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const candidates = excludeName ? rows.filter((r) => r?.name && r.name !== excludeName) : rows;
  if (!candidates.length) return null;

  let total = 0;
  for (const c of candidates) total += Math.max(0, Number(c?.[key]) || 0);
  if (total <= 0) return candidates[0];

  let r = rng() * total;
  for (const c of candidates) {
    r -= Math.max(0, Number(c?.[key]) || 0);
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
};

function MiniStat({ label, value, tone = "neutral" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
      ? "text-amber-700"
      : tone === "danger"
      ? "text-rose-700"
      : "text-slate-800";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function PlayerProbTable({ title, rows, tone }) {
  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
      <div className="mb-2 text-sm font-semibold text-slate-700">{title}</div>
      <table className="w-full min-w-[260px] text-sm">
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={`${title}_${r.player}`} className="border-b border-slate-100">
                <td className="py-1.5">{r.player}</td>
                <td className={`py-1.5 text-right font-semibold ${tone}`}>{r.anytimePct.toFixed(1)}%</td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="py-1.5 text-slate-500" colSpan={2}>
                No player probabilities available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TeamBadge({ name, logo }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
        {logo ? (
          <img src={logo} alt={`${name} logo`} className="h-7 w-7 object-contain" loading="lazy" />
        ) : (
          <span className="text-xs font-semibold text-slate-500">{String(name || "?").slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <span className="truncate text-sm font-semibold text-slate-700">{name}</span>
    </div>
  );
}

function OutcomeBar({ homeTeam, awayTeam, homeWinPct, drawPct, awayWinPct, homeLogo, awayLogo }) {
  const h = clamp(homeWinPct, 0, 100);
  const d = clamp(drawPct, 0, 100);
  const a = clamp(awayWinPct, 0, 100);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <TeamBadge name={homeTeam} logo={homeLogo} />
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
          Draw {d.toFixed(1)}%
        </span>
        <TeamBadge name={awayTeam} logo={awayLogo} />
      </div>
      <div className="h-3 overflow-hidden rounded-full border border-slate-200 bg-white">
        <div className="flex h-full w-full">
          <div className="bg-emerald-500/80" style={{ width: `${h}%` }} />
          <div className="bg-slate-400/70" style={{ width: `${d}%` }} />
          <div className="bg-sky-500/80" style={{ width: `${a}%` }} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 text-center text-xs font-semibold">
        <div className="text-emerald-700">{h.toFixed(1)}%</div>
        <div className="text-slate-600">{d.toFixed(1)}%</div>
        <div className="text-sky-700">{a.toFixed(1)}%</div>
      </div>
    </div>
  );
}

export default function AdjustmentSimulatorPage() {
  const { fetchIfNeeded, loading, Teamdata, Playerdata, Fixtures, dataVersion, fixturesVersion } =
    useAdjustmentData();

  const [selectedGW, setSelectedGW] = useState("");
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [simRunId, setSimRunId] = useState(0);

  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

  const teamRows = Array.isArray(Teamdata?.current) ? Teamdata.current : [];
  const playerRows = Array.isArray(Playerdata?.current) ? Playerdata.current : [];
  const fixtureRows = Array.isArray(Fixtures?.current) ? Fixtures.current : [];

  const teamNameLookup = useMemo(() => {
    const map = new Map();
    for (const r of teamRows) {
      const canonical = firstText(r?.team_name, r?.name, r?.Team, r?.team);
      if (!canonical) continue;
      const aliases = [
        canonical,
        r?.team_name,
        r?.name,
        r?.Team,
        r?.team,
        r?.team_code,
        r?.team_id,
        r?.code,
      ];
      for (const a of aliases) {
        for (const key of teamKeyVariants(a)) {
          if (!map.has(key)) map.set(key, canonical);
        }
      }
    }
    return map;
  }, [teamRows, dataVersion]);

  const teamLogoLookup = useMemo(() => {
    const map = new Map();
    for (const [teamName, logo] of Object.entries(teamLogos || {})) {
      if (!logo) continue;
      for (const key of teamKeyVariants(teamName)) {
        map.set(key, logo);
      }
    }

    for (const r of teamRows) {
      const aliases = [r?.team_name, r?.name, r?.Team, r?.team, r?.team_code, r?.team_id, r?.code];
      let logo = null;
      for (const a of aliases) {
        for (const key of teamKeyVariants(a)) {
          if (map.has(key)) {
            logo = map.get(key);
            break;
          }
        }
        if (logo) break;
      }
      if (!logo) continue;
      for (const a of aliases) {
        for (const key of teamKeyVariants(a)) {
          if (!map.has(key)) map.set(key, logo);
        }
      }
    }
    return map;
  }, [teamRows, dataVersion]);

  const resolveTeamName = (vals) => {
    for (const v of vals) {
      for (const key of teamKeyVariants(v)) {
        const found = teamNameLookup.get(key);
        if (found) return found;
      }
    }
    return firstText(...vals);
  };

  const resolveTeamLogo = (vals) => {
    for (const v of vals) {
      for (const key of teamKeyVariants(v)) {
        const found = teamLogoLookup.get(key);
        if (found) return found;
      }
    }
    return null;
  };

  const fixtureMetaById = useMemo(() => {
    const map = new Map();
    for (const r of teamRows) {
      const id = fixtureIdFromRow(r);
      const teamName = resolveTeamName([r?.team_name, r?.Team, r?.team, r?.team_code, r?.code]);
      if (!id || !teamName) continue;

      const isHome = r?.Home === "H" || r?.Home === "Home" || r?.Home === true;
      const opp = resolveTeamName([r?.Opponent_team, r?.opponent_team, r?.opponent]);
      if (!opp) continue;

      if (!map.has(id)) {
        map.set(id, {
          id,
          homeTeam: isHome ? teamName : opp,
          awayTeam: isHome ? opp : teamName,
          rowsByTeam: new Map(),
        });
      }
      const m = map.get(id);
      m.rowsByTeam.set(normalizeTeamKey(teamName), r);
    }
    return map;
  }, [teamRows, dataVersion, teamNameLookup]);

  const availableGWs = useMemo(() => {
    const set = new Set();
    for (const fx of fixtureRows) {
      for (const o of fx?.options || []) {
        const gw = toNum(o?.gw, null);
        if (isValidGW(gw)) set.add(gw);
      }
    }
    if (!set.size) {
      for (const r of teamRows) {
        const gw = toNum(r?.GW, null);
        if (isValidGW(gw)) set.add(gw);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [fixtureRows, teamRows, fixturesVersion, dataVersion]);

  useEffect(() => {
    if (!availableGWs.length) return;
    if (!selectedGW || !availableGWs.includes(Number(selectedGW))) {
      setSelectedGW(String(availableGWs[0]));
    }
  }, [availableGWs, selectedGW]);

  const fixturesForGW = useMemo(() => {
    const gw = Number(selectedGW);
    if (!isValidGW(gw)) return [];

    const fromOptions = fixtureRows
      .map((fx) => {
        const p = (fx?.options || []).reduce((acc, o) => {
          const optionGw = toNum(o?.gw, null);
          if (optionGw !== gw) return acc;
          return acc + (toNum(o?.p, 0) || 0);
        }, 0);
        if (p <= 0) return null;
        const meta = fixtureMetaById.get(fx.id);
        if (!meta) return null;
        return {
          id: fx.id,
          gw,
          probability: Math.max(0, Math.min(1, p)),
          homeTeam: meta.homeTeam,
          awayTeam: meta.awayTeam,
          homeLogo: resolveTeamLogo([meta.homeTeam]),
          awayLogo: resolveTeamLogo([meta.awayTeam]),
          homeRow: meta.rowsByTeam.get(normalizeTeamKey(meta.homeTeam)) || null,
          awayRow: meta.rowsByTeam.get(normalizeTeamKey(meta.awayTeam)) || null,
        };
      })
      .filter(Boolean);

    if (fromOptions.length) {
      return fromOptions.sort((a, b) => b.probability - a.probability || a.homeTeam.localeCompare(b.homeTeam));
    }

    const byId = new Map();
    for (const r of teamRows) {
      if (toNum(r?.GW, null) !== gw) continue;
      const id = fixtureIdFromRow(r);
      const meta = fixtureMetaById.get(id);
      if (!id || !meta || byId.has(id)) continue;
      byId.set(id, {
        id,
        gw,
        probability: 1,
        homeTeam: meta.homeTeam,
        awayTeam: meta.awayTeam,
        homeLogo: resolveTeamLogo([meta.homeTeam]),
        awayLogo: resolveTeamLogo([meta.awayTeam]),
        homeRow: meta.rowsByTeam.get(normalizeTeamKey(meta.homeTeam)) || null,
        awayRow: meta.rowsByTeam.get(normalizeTeamKey(meta.awayTeam)) || null,
      });
    }
    return Array.from(byId.values()).sort((a, b) => a.homeTeam.localeCompare(b.homeTeam));
  }, [selectedGW, fixtureRows, fixtureMetaById, teamRows, fixturesVersion, dataVersion, teamLogoLookup]);

  useEffect(() => {
    if (!fixturesForGW.length) {
      setSelectedFixtureId("");
      return;
    }
    if (!fixturesForGW.some((f) => f.id === selectedFixtureId)) {
      setSelectedFixtureId(fixturesForGW[0].id);
    }
  }, [fixturesForGW, selectedFixtureId]);

  const selectedFixture = useMemo(
    () => fixturesForGW.find((f) => f.id === selectedFixtureId) || null,
    [fixturesForGW, selectedFixtureId]
  );

  const playerPoolByTeam = useMemo(() => {
    const gw = Number(selectedGW);
    const map = new Map();

    // Player pool formulas (forenklet variant of detailed simulator):
    // - minutesShare = min(1, expected_minutes / 80)
    // - goalWeight   = goalSignal * positionFactor * minutesShare
    // - assistWeight = assistSignal * positionFactor * minutesShare
    const posGoalFactor = (pos) => {
      const p = String(pos || "").toUpperCase();
      if (p.includes("FWD")) return 1.25;
      if (p.includes("MID")) return 1.0;
      if (p.includes("DEF")) return 0.35;
      if (p.includes("GKP")) return 0.03;
      return 0.8;
    };
    const posAssistFactor = (pos) => {
      const p = String(pos || "").toUpperCase();
      if (p.includes("MID")) return 1.15;
      if (p.includes("FWD")) return 0.85;
      if (p.includes("DEF")) return 0.45;
      if (p.includes("GKP")) return 0.03;
      return 0.8;
    };

    for (const row of playerRows) {
      if (toNum(row?.GW, null) !== gw) continue;
      const name = firstText(row?.name, row?.Name, row?.web_name);
      if (!name || name === "0") continue;
      const team = resolveTeamName([
        row?.team_name,
        row?.Team,
        row?.team,
        row?.team_code,
        row?.code,
        row?.team_id,
      ]);
      if (!team) continue;
      const key = normalizeTeamKey(team);

      const position = firstText(row?.position, row?.Position, row?.pos, "");
      const goalPred = Math.max(0, firstNum(row?.calc_goals, row?.Goal_pred, row?.goals, row?.goals_scored, row?.Goal_Statistics, row?.Goal_share, 0) ?? 0);
      const assistPred = Math.max(0, firstNum(row?.calc_assists, row?.Assist_pred, row?.assists, row?.Assist_Statistics, row?.Assist_share, 0) ?? 0);
      const minutes = Math.max(
        1,
        Math.min(95, firstNum(row?.calc_minutes, row?.average_minutes, row?.Avg_Minutes, 75) ?? 75)
      );
      const minutesShare = clamp(minutes / 80, 0.05, 1.0);
      const goalShareStat = Math.max(0, firstNum(row?.Goal_share, row?.Share_of_XG_share, row?.Share_of_XG, 0) ?? 0);
      const assistShareStat = Math.max(0, firstNum(row?.Assist_share, row?.Share_of_XA_share, row?.Share_of_XA, 0) ?? 0);
      const overscoreCap = clamp(firstNum(row?.Average_Overscore, 1) ?? 1, 0.9, 1.15);

      const goalSignal = 0.7 * (goalPred + 0.02) + 0.3 * goalShareStat;
      const assistSignal = 0.7 * (assistPred + 0.02) + 0.3 * assistShareStat;

      const goalWeight = Math.max(0.005, goalSignal * posGoalFactor(position) * minutesShare);
      const assistWeight = Math.max(0.005, assistSignal * posAssistFactor(position) * minutesShare);

      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        name,
        goalPred: goalPred * minutesShare,
        assistPred: assistPred * minutesShare,
        goalWeight,
        assistWeight,
        overscoreCap,
      });
    }

    return map;
  }, [playerRows, selectedGW, dataVersion, teamNameLookup]);

  const simulationResult = useMemo(() => {
    const fx = fixturesForGW.find((f) => f.id === selectedFixtureId);
    if (!fx || simRunId === 0) return null;

    const homeRow = fx?.homeRow || {};
    const awayRow = fx?.awayRow || {};

    const homeTeamPred = predictTeamFromAdjustmentFormula(homeRow);
    const awayTeamPred = predictTeamFromAdjustmentFormula(awayRow);
    const homeXgRaw = homeTeamPred.xg;
    const awayXgRaw = awayTeamPred.xg;
    const homeCsRaw = homeTeamPred.cs;
    const awayCsRaw = awayTeamPred.cs;

    const homePool = playerPoolByTeam.get(normalizeTeamKey(fx.homeTeam)) || [];
    const awayPool = playerPoolByTeam.get(normalizeTeamKey(fx.awayTeam)) || [];
    const sumHomeGoals = homePool.reduce((acc, p) => acc + (p.goalPred || 0), 0);
    const sumAwayGoals = awayPool.reduce((acc, p) => acc + (p.goalPred || 0), 0);
    const sumHomeAssists = homePool.reduce((acc, p) => acc + (p.assistPred || 0), 0);
    const sumAwayAssists = awayPool.reduce((acc, p) => acc + (p.assistPred || 0), 0);

    // Team layer now strictly comes from Adjustment_Analytics_Team formula output:
    // XG -> attacks, CS -> defensive stop%.
    const lambdaHome = homeXgRaw;
    const lambdaAway = awayXgRaw;
    const meanHomeAttacks = attacksFromXg(homeXgRaw, true);
    const meanAwayAttacks = attacksFromXg(awayXgRaw, false);
    const stopHomeAttack = defensiveStopFromCs(awayCsRaw, false); // away team defending
    const stopAwayAttack = defensiveStopFromCs(homeCsRaw, true); // home team defending

    const sigmaHome = clamp(0.06 + 0.04 * Math.abs(lambdaHome - 1.35) + 0.03 * Math.abs(0.35 - homeCsRaw), TEAM_SHOCK_STD_MIN, TEAM_SHOCK_STD_MAX);
    const sigmaAway = clamp(0.06 + 0.04 * Math.abs(lambdaAway - 1.2) + 0.03 * Math.abs(0.35 - awayCsRaw), TEAM_SHOCK_STD_MIN, TEAM_SHOCK_STD_MAX);

    const homeAssistChance = Math.max(
      0.5,
      Math.min(0.92, sumHomeGoals > 0 ? sumHomeAssists / Math.max(0.2, sumHomeGoals * 1.2) : 0.72)
    );
    const awayAssistChance = Math.max(
      0.5,
      Math.min(0.92, sumAwayGoals > 0 ? sumAwayAssists / Math.max(0.2, sumAwayGoals * 1.2) : 0.72)
    );

    const rng = createRng(
      simRunId * 7919 +
        fx.homeTeam.length * 97 +
        fx.awayTeam.length * 193 +
        Math.round(lambdaHome * 100) * 17 +
        Math.round(lambdaAway * 100) * 31
    );

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    let over25 = 0;
    let btts = 0;
    let homeCleanSheets = 0;
    let awayCleanSheets = 0;
    let homeGoalsSum = 0;
    let awayGoalsSum = 0;

    const scorelineMap = new Map();
    const scorerAnyMap = new Map();
    const assisterAnyMap = new Map();
    const scorerTotalMap = new Map();
    const assisterTotalMap = new Map();

    const drawAttacks = (meanAttacks, tempoMult) => {
      const noisyMean = clamp(meanAttacks * tempoMult + sampleNormal(rng, 0, ATTACKS_NOISE_STD), 4, 24);
      return clamp(samplePoisson(noisyMean, rng), ATTACK_TURNS_MIN, ATTACK_TURNS_MAX);
    };

    const goalWeightSumHome = homePool.reduce((acc, p) => acc + Math.max(0, p.goalWeight || 0), 0) || 1;
    const goalWeightSumAway = awayPool.reduce((acc, p) => acc + Math.max(0, p.goalWeight || 0), 0) || 1;

    for (let i = 0; i < SIM_ITERATIONS; i += 1) {
      const homeAttackMult = clamp(Math.exp(sampleNormal(rng, 0, 0.14)), 0.75, 1.35);
      const awayAttackMult = clamp(Math.exp(sampleNormal(rng, 0, 0.14)), 0.75, 1.35);
      const tempoMult = clamp(Math.exp(sampleNormal(rng, 0, TEMPO_SHOCK_STD)), 0.82, 1.24);
      const homeTeamMult = clamp(Math.exp(sampleNormal(rng, -0.5 * sigmaHome * sigmaHome, sigmaHome)), 0.62, 1.58);
      const awayTeamMult = clamp(Math.exp(sampleNormal(rng, -0.5 * sigmaAway * sigmaAway, sigmaAway)), 0.62, 1.58);

      const nHomeAttacks = drawAttacks(meanHomeAttacks, tempoMult);
      const nAwayAttacks = drawAttacks(meanAwayAttacks, tempoMult);
      const homeFinishAvg = weightedTeamFinishProb(homePool, "goalWeight");
      const awayFinishAvg = weightedTeamFinishProb(awayPool, "goalWeight");

      const goalScaleHome = teamGoalScale(
        lambdaHome * homeAttackMult * homeTeamMult * tempoMult,
        nHomeAttacks,
        stopHomeAttack,
        homeFinishAvg
      );
      const goalScaleAway = teamGoalScale(
        lambdaAway * awayAttackMult * awayTeamMult * tempoMult,
        nAwayAttacks,
        stopAwayAttack,
        awayFinishAvg
      );

      const sequence = [];
      for (let x = 0; x < nHomeAttacks; x += 1) sequence.push("H");
      for (let x = 0; x < nAwayAttacks; x += 1) sequence.push("A");
      for (let j = sequence.length - 1; j > 0; j -= 1) {
        const k = Math.floor(rng() * (j + 1));
        const tmp = sequence[j];
        sequence[j] = sequence[k];
        sequence[k] = tmp;
      }

      let hg = 0;
      let ag = 0;
      let hAtt = 0;
      let aAtt = 0;
      let hShots = 0;
      let aShots = 0;
      let hBlocked = 0;
      let aBlocked = 0;
      const iterationScorers = new Set();
      const iterationAssisters = new Set();

      for (const side of sequence) {
        const isHomeAttack = side === "H";
        const pool = isHomeAttack ? homePool : awayPool;
        if (!pool.length) continue;

        if (isHomeAttack) hAtt += 1;
        else aAtt += 1;

        const passStop = isHomeAttack ? stopHomeAttack : stopAwayAttack;
        const assistChance = isHomeAttack ? homeAssistChance : awayAssistChance;
        const goalScale = isHomeAttack ? goalScaleHome : goalScaleAway;
        const gWeightSum = isHomeAttack ? goalWeightSumHome : goalWeightSumAway;

        const creator = pickWeighted(pool, "assistWeight", rng);
        if (!creator?.name) continue;

        if (rng() < passStop) {
          continue;
        }

        const shooter = pickWeighted(pool, "goalWeight", rng);
        if (!shooter?.name) continue;
        if (isHomeAttack) hShots += 1;
        else aShots += 1;

        if (rng() < passStop) {
          if (isHomeAttack) hBlocked += 1;
          else aBlocked += 1;
          continue;
        }

        const shooterShare = clamp((Math.max(0, shooter.goalWeight || 0) || 0) / gWeightSum, 0, 1);
        const pGoal = shotGoalProbability(shooter, shooterShare, goalScale);
        if (rng() < pGoal) {
          if (isHomeAttack) hg += 1;
          else ag += 1;
          const scorerKey = `${isHomeAttack ? fx.homeTeam : fx.awayTeam}__${shooter.name}`;
          scorerTotalMap.set(scorerKey, (scorerTotalMap.get(scorerKey) || 0) + 1);
          iterationScorers.add(scorerKey);

          if (creator.name !== shooter.name && rng() < assistChance) {
            const assistKey = `${isHomeAttack ? fx.homeTeam : fx.awayTeam}__${creator.name}`;
            assisterTotalMap.set(assistKey, (assisterTotalMap.get(assistKey) || 0) + 1);
            iterationAssisters.add(assistKey);
          }
        }
      }

      homeGoalsSum += hg;
      awayGoalsSum += ag;

      if (hg > ag) homeWins += 1;
      else if (ag > hg) awayWins += 1;
      else draws += 1;
      if (ag === 0) homeCleanSheets += 1;
      if (hg === 0) awayCleanSheets += 1;
      if (hg + ag >= 3) over25 += 1;
      if (hg > 0 && ag > 0) btts += 1;

      iterationScorers.forEach((k) => scorerAnyMap.set(k, (scorerAnyMap.get(k) || 0) + 1));
      iterationAssisters.forEach((k) => assisterAnyMap.set(k, (assisterAnyMap.get(k) || 0) + 1));

      const scorelineKey = `${hg}-${ag}`;
      scorelineMap.set(scorelineKey, (scorelineMap.get(scorelineKey) || 0) + 1);
    }

    const topScorelines = Array.from(scorelineMap.entries())
      .map(([scoreline, count]) => ({ scoreline, count, pct: (count / SIM_ITERATIONS) * 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const topScoreline = topScorelines[0] || null;

    const toPlayerRows = (anyMap, totalMap, teamName) =>
      Array.from(anyMap.entries())
        .filter(([k]) => k.startsWith(`${teamName}__`))
        .map(([key, anyCount]) => {
          const player = key.split("__")[1];
          const totalCount = totalMap.get(key) || 0;
          return {
            player,
            anytimePct: (anyCount / SIM_ITERATIONS) * 100,
            expected: totalCount / SIM_ITERATIONS,
          };
        })
        .sort((a, b) => b.anytimePct - a.anytimePct || b.expected - a.expected)
        .slice(0, 8);

    const homeScorers = toPlayerRows(scorerAnyMap, scorerTotalMap, fx.homeTeam);
    const awayScorers = toPlayerRows(scorerAnyMap, scorerTotalMap, fx.awayTeam);
    const homeAssisters = toPlayerRows(assisterAnyMap, assisterTotalMap, fx.homeTeam);
    const awayAssisters = toPlayerRows(assisterAnyMap, assisterTotalMap, fx.awayTeam);

    const parseScoreGoal = (scoreline, idx) => {
      const value = Number(String(scoreline || "").split("-")[idx]);
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(8, Math.round(value)));
    };

    const buildLikelyEvents = (teamName, teamLogo, goalCount, scorerRows, assisterRows) => {
      const events = [];
      if (goalCount <= 0) return events;
      const scorers = scorerRows.length ? scorerRows : [{ player: `${teamName} scorer` }];
      for (let i = 0; i < goalCount; i += 1) {
        const scorer = scorers[Math.min(i, scorers.length - 1)]?.player || `${teamName} scorer`;
        let assister = "";
        for (let j = 0; j < assisterRows.length; j += 1) {
          const candidate = assisterRows[(i + j) % assisterRows.length]?.player;
          if (candidate && candidate !== scorer) {
            assister = candidate;
            break;
          }
        }
        events.push({ team: teamName, logo: teamLogo, scorer, assister });
      }
      return events;
    };

    const interleaveEvents = (homeEvents, awayEvents) => {
      const out = [];
      const maxLen = Math.max(homeEvents.length, awayEvents.length);
      for (let i = 0; i < maxLen; i += 1) {
        if (i < homeEvents.length) out.push(homeEvents[i]);
        if (i < awayEvents.length) out.push(awayEvents[i]);
      }
      return out;
    };

    const likelyHomeGoals = parseScoreGoal(topScoreline?.scoreline, 0);
    const likelyAwayGoals = parseScoreGoal(topScoreline?.scoreline, 1);
    const likelyHomeEvents = buildLikelyEvents(fx.homeTeam, fx.homeLogo, likelyHomeGoals, homeScorers, homeAssisters);
    const likelyAwayEvents = buildLikelyEvents(fx.awayTeam, fx.awayLogo, likelyAwayGoals, awayScorers, awayAssisters);
    const likelyEvents = interleaveEvents(likelyHomeEvents, likelyAwayEvents);
    const minuteRng = createRng(
      simRunId * 4591 +
        (fx.homeTeam?.length || 0) * 23 +
        (fx.awayTeam?.length || 0) * 37 +
        likelyEvents.length * 101
    );
    const usedMinutes = new Set();
    const mostLikelySequence = likelyEvents
      .map((ev) => {
        let minute = Math.max(2, Math.min(93, Math.round(6 + minuteRng() * 86)));
        while (usedMinutes.has(minute) && minute < 94) minute += 1;
        usedMinutes.add(minute);
        return { ...ev, minute };
      })
      .sort((a, b) => a.minute - b.minute);

    return {
      fixture: fx,
      model: {
        lambdaHome,
        lambdaAway,
        xgHome: homeXgRaw,
        xgAway: awayXgRaw,
        meanHomeAttacks,
        meanAwayAttacks,
        stopHomeAttack,
        stopAwayAttack,
        playerRowsHome: homePool.length,
        playerRowsAway: awayPool.length,
      },
      homeWinPct: pct(homeWins, SIM_ITERATIONS),
      drawPct: pct(draws, SIM_ITERATIONS),
      awayWinPct: pct(awayWins, SIM_ITERATIONS),
      over25Pct: pct(over25, SIM_ITERATIONS),
      bttsPct: pct(btts, SIM_ITERATIONS),
      homeCsPct: pct(homeCleanSheets, SIM_ITERATIONS),
      awayCsPct: pct(awayCleanSheets, SIM_ITERATIONS),
      avgHomeGoals: homeGoalsSum / SIM_ITERATIONS,
      avgAwayGoals: awayGoalsSum / SIM_ITERATIONS,
      predictedAvgScoreline: `${Math.round(homeGoalsSum / SIM_ITERATIONS)}-${Math.round(awayGoalsSum / SIM_ITERATIONS)}`,
      mostLikelyScoreline: topScoreline?.scoreline || "N/A",
      mostLikelyScorelinePct: topScoreline?.pct || 0,
      mostLikelySequence,
      topScorelines,
      homeScorers,
      awayScorers,
      homeAssisters,
      awayAssisters,
    };
  }, [fixturesForGW, selectedFixtureId, simRunId, playerPoolByTeam]);

  if (loading && !teamRows.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading simulator...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="mb-3 flex items-center gap-2">
          <PlayCircle size={18} className="text-emerald-600" />
          <h2 className="text-lg font-semibold">Simulator</h2>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Match simulation with scoreline probabilities, likely scorers, assisters, and a visual scoring timeline.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            GW
            <select
              value={selectedGW}
              onChange={(e) => setSelectedGW(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {availableGWs.map((gw) => (
                <option key={`gw_opt_${gw}`} value={String(gw)}>
                  GW {gw}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
            Match
            <select
              value={selectedFixtureId}
              onChange={(e) => setSelectedFixtureId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {fixturesForGW.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.homeTeam} vs {f.awayTeam} ({(f.probability * 100).toFixed(0)}%)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setSimRunId((v) => v + 1)}
            disabled={!fixturesForGW.length}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run Simulation
          </button>
        </div>

        {selectedFixture && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="justify-self-start">
                <TeamBadge name={selectedFixture.homeTeam} logo={selectedFixture.homeLogo} />
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                GW {selectedFixture.gw}
              </div>
              <div className="justify-self-end">
                <TeamBadge name={selectedFixture.awayTeam} logo={selectedFixture.awayLogo} />
              </div>
            </div>
          </div>
        )}
      </section>

      {!simulationResult && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Select GW and match, then run the simulation.
        </section>
      )}

      {simulationResult && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <OutcomeBar
            homeTeam={simulationResult.fixture.homeTeam}
            awayTeam={simulationResult.fixture.awayTeam}
            homeLogo={simulationResult.fixture.homeLogo}
            awayLogo={simulationResult.fixture.awayLogo}
            homeWinPct={simulationResult.homeWinPct}
            drawPct={simulationResult.drawPct}
            awayWinPct={simulationResult.awayWinPct}
          />

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <MiniStat label="Predicted Result" value={simulationResult.predictedAvgScoreline} tone="neutral" />
            <MiniStat
              label="Most Likely Scoreline"
              value={`${simulationResult.mostLikelyScoreline} (${simulationResult.mostLikelyScorelinePct.toFixed(1)}%)`}
              tone="warn"
            />
            <MiniStat
              label="Expected Goals (H-A)"
              value={`${simulationResult.avgHomeGoals.toFixed(2)} - ${simulationResult.avgAwayGoals.toFixed(2)}`}
              tone="neutral"
            />
          </div>

          <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <div className="text-sm font-semibold text-slate-800">Most likely scoring sequence</div>
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              {simulationResult.mostLikelySequence.length ? (
                simulationResult.mostLikelySequence.map((ev, idx) => (
                  <div
                    key={`sequence_${idx}_${ev.team}_${ev.minute}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
                        {ev.logo ? (
                          <img src={ev.logo} alt={`${ev.team} logo`} className="h-5 w-5 object-contain" loading="lazy" />
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-500">{String(ev.team || "?").slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0 truncate">
                        <span className="font-semibold text-slate-800">{ev.scorer}</span>
                        {ev.assister ? <span className="text-slate-500"> ({ev.assister})</span> : null}
                        <span className="ml-1 text-slate-500">- {ev.team}</span>
                      </div>
                    </div>
                    <span className="ml-2 shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      {ev.minute}'
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
                  No goals in the most likely scoreline.
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <MiniStat label={`${simulationResult.fixture.homeTeam} Clean Sheet`} value={`${simulationResult.homeCsPct.toFixed(1)}%`} tone="good" />
            <MiniStat label={`${simulationResult.fixture.awayTeam} Clean Sheet`} value={`${simulationResult.awayCsPct.toFixed(1)}%`} tone="danger" />
            <MiniStat label="Over 2.5 Goals" value={`${simulationResult.over25Pct.toFixed(1)}%`} tone="good" />
            <MiniStat label="BTTS" value={`${simulationResult.bttsPct.toFixed(1)}%`} tone="warn" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              <div className="mb-2 text-sm font-semibold text-slate-700">Top Scorelines</div>
              <table className="w-full min-w-[320px] text-sm">
                <tbody>
                  {simulationResult.topScorelines.map((s) => (
                    <tr key={s.scoreline} className="border-b border-slate-100">
                      <td className="py-1.5">{s.scoreline}</td>
                      <td className="py-1.5 text-right font-semibold text-emerald-700">{s.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                Model XG: {simulationResult.model.xgHome.toFixed(2)} - {simulationResult.model.xgAway.toFixed(2)} | CS Odds:{" "}
                {(simulationResult.homeCsPct).toFixed(1)}% / {(simulationResult.awayCsPct).toFixed(1)}%
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PlayerProbTable title={`Scorers - ${simulationResult.fixture.homeTeam}`} rows={simulationResult.homeScorers} tone="text-emerald-700" />
              <PlayerProbTable title={`Scorers - ${simulationResult.fixture.awayTeam}`} rows={simulationResult.awayScorers} tone="text-emerald-700" />
              <PlayerProbTable title={`Assisters - ${simulationResult.fixture.homeTeam}`} rows={simulationResult.homeAssisters} tone="text-sky-700" />
              <PlayerProbTable title={`Assisters - ${simulationResult.fixture.awayTeam}`} rows={simulationResult.awayAssisters} tone="text-sky-700" />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
