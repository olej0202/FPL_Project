import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Flame,
  GitMerge,
  Gauge,
  PlayCircle,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStatsData } from "./Contexts/StatsContext";
import { useOtherData } from "./Contexts/OtherContext";
import teamLogos from "./utils/team_logos";

const toNum = (...vals) => {
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

const norm = (v) => String(v ?? "").trim().toLowerCase();
const isValidGW = (gw) => Number.isInteger(gw) && gw >= 1 && gw <= 38;
const normalizeTeamKey = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const isValidName = (v) => {
  const s = String(v ?? "").trim();
  return s !== "" && s !== "0";
};

const teamKeyVariants = (value) => {
  const base = String(value ?? "").trim();
  if (!base) return [];
  const out = new Set([norm(base)]);
  const asNum = Number(base);
  if (Number.isFinite(asNum)) {
    out.add(norm(String(asNum)));
    out.add(norm(String(Math.trunc(asNum))));
  }
  return Array.from(out).filter(Boolean);
};

function ownershipPercent(row) {
  const raw = toNum(row?.selected_pct, row?.selected_by_percent, row?.ownership, row?.selected);
  if (!Number.isFinite(raw)) return null;
  return raw <= 1 ? raw * 100 : raw;
}

const getTeamNameFromStrengthRow = (row) => {
  const raw = row?.name ?? row?.team_name ?? row?.Team ?? row?.team ?? row?.full_name;
  return raw ? String(raw).trim() : null;
};

const getRawTeamStrength = (row) => {
  const attack = toNum(row?.XG_avg, row?.XG, row?.xg, row?.XGH, row?.attack_strength);
  const defense = toNum(
    row?.XGC_avg,
    row?.XGC,
    row?.xgc,
    row?.XGCH,
    row?.defence_strength,
    row?.defense_strength
  );

  if (!Number.isFinite(attack) && !Number.isFinite(defense)) return null;
  const a = Number.isFinite(attack) ? attack : 1.25;
  const d = Number.isFinite(defense) ? defense : 1.25;
  return a - 0.45 * d;
};

const buildOpponentStrengthLookup = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return new Map();

  const grouped = new Map();
  rows.forEach((row) => {
    const teamName = getTeamNameFromStrengthRow(row);
    const rawStrength = getRawTeamStrength(row);
    if (!teamName || !Number.isFinite(rawStrength)) return;

    const key = normalizeTeamKey(teamName);
    const cur = grouped.get(key);
    if (!cur) grouped.set(key, { teamName, sum: rawStrength, count: 1 });
    else grouped.set(key, { teamName: cur.teamName, sum: cur.sum + rawStrength, count: cur.count + 1 });
  });

  if (!grouped.size) return new Map();

  const values = Array.from(grouped.values()).map((v) => v.sum / Math.max(1, v.count));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-6, max - min);

  const lookup = new Map();
  Array.from(grouped.values()).forEach((v) => {
    const strength = v.sum / Math.max(1, v.count);
    const normalized = (strength - min) / span;
    lookup.set(normalizeTeamKey(v.teamName), normalized);
  });

  return lookup;
};

const splitOpponentParts = (value) =>
  String(value || "")
    .split(/\s*(\/|&|,|;|\band\b|\bAND\b)\s*/g)
    .filter((x) => x && !/^(\/|&|,|;|and|AND)$/i.test(x))
    .map((x) => x.trim())
    .filter(Boolean);

const lookupStrengthForOpponent = (lookup, opponentValue) => {
  if (!(lookup instanceof Map) || lookup.size === 0 || !opponentValue) return null;
  const candidates = splitOpponentParts(opponentValue);
  if (!candidates.length) candidates.push(String(opponentValue));

  const scores = candidates
    .map((cand) => {
      const key = normalizeTeamKey(cand);
      if (lookup.has(key)) return lookup.get(key);
      return null;
    })
    .filter((v) => Number.isFinite(v));

  if (!scores.length) return null;
  return Math.max(...scores);
};

const pearson = (arrA, arrB) => {
  if (!arrA.length || arrA.length !== arrB.length) return null;
  const n = arrA.length;
  const meanA = arrA.reduce((a, b) => a + b, 0) / n;
  const meanB = arrB.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = arrA[i] - meanA;
    const db = arrB[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den <= 1e-9) return null;
  return num / den;
};

const heatColor = (ease) => {
  if (!Number.isFinite(ease)) return "bg-slate-100 text-slate-500";
  if (ease >= 0.75) return "bg-emerald-100 text-emerald-800";
  if (ease >= 0.58) return "bg-emerald-50 text-emerald-700";
  if (ease >= 0.45) return "bg-amber-50 text-amber-700";
  if (ease >= 0.32) return "bg-rose-50 text-rose-700";
  return "bg-rose-100 text-rose-800";
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

const pickWeighted = (rows, key, rng, excludeName = null) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const candidates = excludeName
    ? rows.filter((r) => r?.name && r.name !== excludeName)
    : rows;
  if (!candidates.length) return null;

  let total = 0;
  for (const c of candidates) {
    total += Math.max(0, Number(c?.[key]) || 0);
  }
  if (total <= 0) return candidates[0];

  let r = rng() * total;
  for (const c of candidates) {
    r -= Math.max(0, Number(c?.[key]) || 0);
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
};

function buildTeamNameLookups(fixtures, teamRows) {
  const global = new Map();
  const byGw = new Map();

  const add = (name, key, gw = null) => {
    const cleanName = String(name ?? "").trim();
    if (!cleanName || cleanName === "0") return;

    const keys = teamKeyVariants(key);
    if (!keys.length) return;

    for (const k of keys) {
      if (!global.has(k)) global.set(k, cleanName);

      if (!isValidGW(gw)) continue;
      if (!byGw.has(gw)) byGw.set(gw, new Map());
      const gwMap = byGw.get(gw);
      if (!gwMap.has(k)) gwMap.set(k, cleanName);
    }
  };

  for (const row of fixtures || []) {
    const gw = toNum(row?.GW, row?.gw, null);
    const teamName = firstText(row?.team_name, row?.name, row?.Team, row?.team);
    const keys = [
      teamName,
      row?.team_name,
      row?.name,
      row?.Team,
      row?.team,
      row?.team_code,
      row?.team_id,
      row?.code,
      row?.id,
    ];
    for (const key of keys) add(teamName, key, gw);
  }

  for (const row of teamRows || []) {
    const gw = toNum(row?.GW, row?.gw, null);
    const teamName = firstText(row?.team_name, row?.name, row?.Team, row?.team, row?.full_name);
    const keys = [
      teamName,
      row?.team_name,
      row?.name,
      row?.Team,
      row?.team,
      row?.team_code,
      row?.team_id,
      row?.code,
      row?.id,
    ];
    for (const key of keys) add(teamName, key, gw);
  }

  return { global, byGw };
}

function resolveTeamName(row, lookups) {
  const gw = toNum(row?.GW, row?.gw, null);
  const gwMap = isValidGW(gw) ? lookups?.byGw?.get(gw) : null;
  const candidates = [row?.team_name, row?.Team, row?.team, row?.team_code, row?.team_id, row?.code];

  for (const c of candidates) {
    const keys = teamKeyVariants(c);
    for (const k of keys) {
      if (gwMap?.has(k)) return gwMap.get(k);
    }
  }

  for (const c of candidates) {
    const keys = teamKeyVariants(c);
    for (const k of keys) {
      if (lookups?.global?.has(k)) return lookups.global.get(k);
    }
  }

  return firstText(row?.team_name, row?.Team, row?.team);
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-300 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/70 hover:text-emerald-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

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

export default function Test1() {
  const navigate = useNavigate();
  const {
    fetchIfNeeded: fetchStatsIfNeeded,
    loading: statsLoading,
    PlayersData,
    TeamData,
    dataVersion: statsVersion,
  } = useStatsData();
  const {
    fetchIfNeeded: fetchOtherIfNeeded,
    loading: otherLoading,
    FixtureData,
    ScorePredData,
    dataVersion: otherVersion,
  } = useOtherData();

  const [horizon, setHorizon] = useState(5);
  const [ownershipCap, setOwnershipCap] = useState(15);
  const [positionFilter, setPositionFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [selectedPairKey, setSelectedPairKey] = useState("");
  const [selectedFixtureKey, setSelectedFixtureKey] = useState("");
  const [simIterations, setSimIterations] = useState(1500);
  const [simRunId, setSimRunId] = useState(0);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchStatsIfNeeded?.(), fetchOtherIfNeeded?.()]);
    })();
  }, [fetchStatsIfNeeded, fetchOtherIfNeeded]);

  const playerRows = Array.isArray(PlayersData?.current) ? PlayersData.current : [];
  const teamRows = Array.isArray(TeamData?.current) ? TeamData.current : [];
  const fixtureRows = Array.isArray(FixtureData?.current) ? FixtureData.current : [];
  const scoreRows = Array.isArray(ScorePredData?.current) ? ScorePredData.current : [];

  const upcomingGW = useMemo(() => {
    const fromFixtures = fixtureRows.map((r) => toNum(r?.GW, null)).filter((gw) => isValidGW(gw));
    if (fromFixtures.length) return Math.min(...fromFixtures);
    const fromPlayers = playerRows.map((r) => toNum(r?.GW, null)).filter((gw) => isValidGW(gw));
    if (fromPlayers.length) return Math.min(...fromPlayers);
    return null;
  }, [fixtureRows, playerRows, otherVersion, statsVersion]);

  const horizonGWs = useMemo(() => {
    if (!isValidGW(upcomingGW)) return [];
    const gws = Array.from(
      new Set(
        fixtureRows
          .map((r) => toNum(r?.GW, null))
          .filter((gw) => isValidGW(gw) && gw >= upcomingGW)
      )
    ).sort((a, b) => a - b);
    return gws.slice(0, horizon);
  }, [fixtureRows, upcomingGW, horizon, otherVersion]);

  const teamLookups = useMemo(
    () => buildTeamNameLookups(fixtureRows, teamRows),
    [fixtureRows, teamRows, otherVersion, statsVersion]
  );

  const opponentStrengthLookup = useMemo(
    () => buildOpponentStrengthLookup(teamRows),
    [teamRows, statsVersion]
  );

  const fixtureDifficulty = useMemo(() => {
    if (!horizonGWs.length) return [];
    const gwSet = new Set(horizonGWs);
    const byTeam = new Map();

    for (const row of fixtureRows) {
      const gw = toNum(row?.GW, null);
      if (!gwSet.has(gw)) continue;

      const teamName = resolveTeamName(row, teamLookups);
      const fallbackKey = firstText(row?.team_name, row?.Team, row?.team, row?.team_code, row?.code);
      const teamKey = norm(teamName || fallbackKey);
      if (!teamKey) continue;

      const opp = firstText(row?.opponent_name, row?.Opponent_team, row?.opponent, "TBD");
      const oppStrength = lookupStrengthForOpponent(opponentStrengthLookup, opp);
      const homeRaw = row?.Home ?? row?.home ?? row?.was_home;
      const isHome =
        homeRaw === true || homeRaw === "H" || homeRaw === "Home" || homeRaw === "home";
      const baseEase = Number.isFinite(oppStrength) ? 1 - oppStrength : 0.5;
      const ease = Math.max(0.05, Math.min(0.95, baseEase + (isHome ? 0.08 : -0.04)));

      const current = byTeam.get(teamKey) || {
        team: teamName || fallbackKey || "Unknown",
        easeTotal: 0,
        count: 0,
        oppStrengthTotal: 0,
        opponents: new Set(),
        byGw: new Map(),
      };
      current.easeTotal += ease;
      current.oppStrengthTotal += Number.isFinite(oppStrength) ? oppStrength : 0.5;
      current.count += 1;
      if (opp) current.opponents.add(opp);

      const cell = current.byGw.get(gw) || { easeSum: 0, count: 0, opponents: new Set() };
      cell.easeSum += ease;
      cell.count += 1;
      if (opp) cell.opponents.add(opp);
      current.byGw.set(gw, cell);

      byTeam.set(teamKey, current);
    }

    return Array.from(byTeam.values())
      .map((t) => {
        const avgEase = t.count ? t.easeTotal / t.count : 0;
        const avgOppStrength = t.count ? t.oppStrengthTotal / t.count : 0;
        const gwSeries = horizonGWs.map((gw) => {
          const c = t.byGw.get(gw);
          return c && c.count ? c.easeSum / c.count : null;
        });

        let bestGW = null;
        let bestEase = -1;
        gwSeries.forEach((v, idx) => {
          if (Number.isFinite(v) && v > bestEase) {
            bestEase = v;
            bestGW = horizonGWs[idx];
          }
        });

        return {
          ...t,
          avgEase,
          avgOppStrength,
          bestGW,
          gwSeries,
          opponentsText: Array.from(t.opponents).slice(0, 4).join(" / "),
        };
      })
      .sort((a, b) => b.avgEase - a.avgEase);
  }, [fixtureRows, horizonGWs, teamLookups, opponentStrengthLookup, otherVersion]);

  const teamEaseMap = useMemo(() => {
    const map = new Map();
    fixtureDifficulty.forEach((t) => {
      map.set(normalizeTeamKey(t.team), t.gwSeries);
    });
    return map;
  }, [fixtureDifficulty]);

  const antiCorrelatedPairs = useMemo(() => {
    const teams = fixtureDifficulty.map((t) => t.team);
    const rows = [];

    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        const teamA = teams[i];
        const teamB = teams[j];
        const vecA = teamEaseMap.get(normalizeTeamKey(teamA)) || [];
        const vecB = teamEaseMap.get(normalizeTeamKey(teamB)) || [];

        const pairsA = [];
        const pairsB = [];
        const rotation = [];
        for (let k = 0; k < horizonGWs.length; k += 1) {
          const a = vecA[k];
          const b = vecB[k];
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          pairsA.push(a);
          pairsB.push(b);
          rotation.push(Math.max(a, b));
        }

        if (pairsA.length < 3) continue;
        const corr = pearson(pairsA, pairsB);
        if (!Number.isFinite(corr)) continue;
        const rotationScore = rotation.reduce((acc, x) => acc + x, 0) / rotation.length;

        rows.push({
          pairKey: `${teamA}__${teamB}`,
          teamA,
          teamB,
          corr,
          rotationScore,
          seriesA: vecA,
          seriesB: vecB,
        });
      }
    }

    return rows.sort((a, b) => a.corr - b.corr || b.rotationScore - a.rotationScore).slice(0, 8);
  }, [fixtureDifficulty, teamEaseMap, horizonGWs]);

  const playerProfiles = useMemo(() => {
    if (!horizonGWs.length || !isValidGW(upcomingGW)) return [];
    const gwSet = new Set(horizonGWs);
    const byPlayer = new Map();

    for (const row of playerRows) {
      const gw = toNum(row?.GW, null);
      if (!gwSet.has(gw)) continue;

      const name = firstText(row?.Name, row?.name, row?.web_name);
      if (!isValidName(name)) continue;

      const points = toNum(row?.Points_prediction, row?.calc_points, row?.points, null);
      if (!Number.isFinite(points)) continue;

      const key = norm(name);
      const team = resolveTeamName(row, teamLookups);
      const position = firstText(row?.position, row?.Position, row?.pos, "UNK");
      const own = ownershipPercent(row);
      const opp = firstText(row?.opponent_name, row?.Opponent_team, row?.opponent);

      const current = byPlayer.get(key) || {
        key,
        name,
        team: team || "Unknown",
        position,
        ownership: null,
        byGw: new Map(),
        opponents: new Set(),
      };

      if (team && (!current.team || current.team === "Unknown")) current.team = team;
      if (position && current.position === "UNK") current.position = position;
      if (Number.isFinite(own)) {
        current.ownership = Number.isFinite(current.ownership)
          ? Math.min(current.ownership, own)
          : own;
      }

      current.byGw.set(gw, points);
      if (opp) current.opponents.add(opp);
      byPlayer.set(key, current);
    }

    return Array.from(byPlayer.values())
      .filter((p) => p.byGw.size >= Math.min(2, horizonGWs.length))
      .map((p) => {
        const points = Array.from(p.byGw.values());
        const total = points.reduce((a, b) => a + b, 0);
        const avg = points.length ? total / points.length : 0;
        const ceiling = points.length ? Math.max(...points) : 0;
        const floor = points.length ? Math.min(...points) : 0;
        const upcomingPoints = p.byGw.get(upcomingGW) ?? avg;
        const score = upcomingPoints * 0.6 + avg * 0.3 + ceiling * 0.1;
        return {
          ...p,
          total,
          avg,
          ceiling,
          floor,
          upcomingPoints,
          score,
          opponentsText: Array.from(p.opponents).slice(0, 4).join(" / "),
        };
      });
  }, [playerRows, horizonGWs, upcomingGW, teamLookups, statsVersion]);

  const teamOptions = useMemo(
    () => ["All", ...Array.from(new Set(playerProfiles.map((p) => p.team).filter(Boolean))).sort()],
    [playerProfiles]
  );

  const positionOptions = useMemo(
    () => ["All", ...Array.from(new Set(playerProfiles.map((p) => p.position).filter(Boolean))).sort()],
    [playerProfiles]
  );

  useEffect(() => {
    if (!teamOptions.includes(teamFilter)) setTeamFilter("All");
  }, [teamOptions, teamFilter]);

  useEffect(() => {
    if (!positionOptions.includes(positionFilter)) setPositionFilter("All");
  }, [positionOptions, positionFilter]);

  const filteredProfiles = useMemo(() => {
    return playerProfiles.filter((p) => {
      if (positionFilter !== "All" && p.position !== positionFilter) return false;
      if (teamFilter !== "All" && p.team !== teamFilter) return false;
      return true;
    });
  }, [playerProfiles, positionFilter, teamFilter]);

  const gemList = useMemo(() => {
    return [...filteredProfiles]
      .filter((p) => Number.isFinite(p.ownership) && p.ownership <= ownershipCap)
      .sort((a, b) => b.avg - a.avg || b.score - a.score)
      .slice(0, 10);
  }, [filteredProfiles, ownershipCap]);

  const matchChaos = useMemo(() => {
    const normalized = scoreRows
      .map((r, idx) => {
        const gw = toNum(r?.GW, r?.gw, r?.gameweek, upcomingGW);
        const home = firstText(r?.home_team, r?.Home_team, r?.home, r?.Home);
        const away = firstText(r?.away_team, r?.Away_team, r?.away, r?.Away);
        const homeGoals = toNum(r?.home_goals, r?.Home_goals, r?.home_xg, r?.home_pred, null);
        const awayGoals = toNum(r?.away_goals, r?.Away_goals, r?.away_xg, r?.away_pred, null);
        if (!home || !away || !Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return null;

        const total = homeGoals + awayGoals;
        const diff = Math.abs(homeGoals - awayGoals);
        const chaos = total - diff * 0.35;

        return {
          key: `${home}_${away}_${gw}_${idx}`,
          gw,
          home,
          away,
          homeGoals,
          awayGoals,
          total,
          diff,
          chaos,
        };
      })
      .filter(Boolean);

    if (!normalized.length) return { open: null, tight: null, oneSided: null, table: [] };

    const forGW = isValidGW(upcomingGW)
      ? normalized.filter((m) => Number(m.gw) === Number(upcomingGW))
      : normalized;
    const rows = forGW.length ? forGW : normalized;

    const open = [...rows].sort((a, b) => b.total - a.total)[0] || null;
    const tight = [...rows].sort((a, b) => a.diff - b.diff || b.total - a.total)[0] || null;
    const oneSided = [...rows].sort((a, b) => b.diff - a.diff || b.total - a.total)[0] || null;
    const table = [...rows].sort((a, b) => b.chaos - a.chaos).slice(0, 8);

    return { open, tight, oneSided, table };
  }, [scoreRows, upcomingGW, otherVersion]);

  const predictedMatches = useMemo(() => {
    const direct = scoreRows
      .map((r, idx) => {
        const gw = toNum(r?.GW, r?.gw, r?.gameweek, upcomingGW);
        const home = firstText(r?.home_team, r?.Home_team, r?.home, r?.Home);
        const away = firstText(r?.away_team, r?.Away_team, r?.away, r?.Away);
        const homeXg = toNum(r?.home_goals, r?.Home_goals, r?.home_xg, r?.home_pred, null);
        const awayXg = toNum(r?.away_goals, r?.Away_goals, r?.away_xg, r?.away_pred, null);
        if (!home || !away || !Number.isFinite(homeXg) || !Number.isFinite(awayXg)) return null;
        return {
          key: `direct_${home}_${away}_${gw}_${idx}`,
          gw: isValidGW(gw) ? gw : upcomingGW,
          home,
          away,
          homeXg: Math.max(0.05, homeXg),
          awayXg: Math.max(0.05, awayXg),
          source: "score",
        };
      })
      .filter(Boolean);

    if (direct.length) {
      const forGW = isValidGW(upcomingGW) ? direct.filter((m) => m.gw === upcomingGW) : direct;
      return (forGW.length ? forGW : direct).slice(0, 20);
    }

    const gwSet = new Set(horizonGWs.length ? [horizonGWs[0]] : []);
    const map = new Map();
    for (const row of fixtureRows) {
      const gw = toNum(row?.GW, null);
      if (!gwSet.has(gw)) continue;

      const team = resolveTeamName(row, teamLookups);
      const opp = firstText(row?.opponent_name, row?.Opponent_team, row?.opponent);
      if (!team || !opp) continue;

      const homeRaw = row?.Home ?? row?.home ?? row?.was_home;
      const isHome =
        homeRaw === true || homeRaw === "H" || homeRaw === "Home" || homeRaw === "home";
      const home = isHome ? team : opp;
      const away = isHome ? opp : team;

      const pairKey = `${gw}_${normalizeTeamKey(home)}__${normalizeTeamKey(away)}`;
      const cur = map.get(pairKey) || {
        key: `fixture_${pairKey}`,
        gw,
        home,
        away,
        homeXg: [],
        awayXg: [],
        source: "fixture",
      };
      const xg = toNum(row?.XG, row?.xg, row?.pred, null);
      if (Number.isFinite(xg)) {
        if (isHome) cur.homeXg.push(xg);
        else cur.awayXg.push(xg);
      }
      map.set(pairKey, cur);
    }

    return Array.from(map.values()).map((m) => ({
      ...m,
      homeXg: m.homeXg.length ? m.homeXg.reduce((a, b) => a + b, 0) / m.homeXg.length : 1.2,
      awayXg: m.awayXg.length ? m.awayXg.reduce((a, b) => a + b, 0) / m.awayXg.length : 1.0,
    }));
  }, [scoreRows, fixtureRows, horizonGWs, upcomingGW, teamLookups]);

  useEffect(() => {
    if (!antiCorrelatedPairs.length) {
      setSelectedPairKey("");
      return;
    }
    if (!antiCorrelatedPairs.some((p) => p.pairKey === selectedPairKey)) {
      setSelectedPairKey(antiCorrelatedPairs[0].pairKey);
    }
  }, [antiCorrelatedPairs, selectedPairKey]);

  useEffect(() => {
    if (!predictedMatches.length) {
      setSelectedFixtureKey("");
      return;
    }
    if (!predictedMatches.some((m) => m.key === selectedFixtureKey)) {
      setSelectedFixtureKey(predictedMatches[0].key);
    }
  }, [predictedMatches, selectedFixtureKey]);

  const selectedPair = useMemo(
    () => antiCorrelatedPairs.find((p) => p.pairKey === selectedPairKey) || antiCorrelatedPairs[0] || null,
    [antiCorrelatedPairs, selectedPairKey]
  );

  const bestRotationPair = useMemo(
    () => [...antiCorrelatedPairs].sort((a, b) => b.rotationScore - a.rotationScore)[0] || null,
    [antiCorrelatedPairs]
  );

  const pairChartData = useMemo(() => {
    if (!selectedPair) return [];
    return horizonGWs.map((gw, idx) => ({
      gw: `GW${gw}`,
      [selectedPair.teamA]: Number.isFinite(selectedPair.seriesA[idx]) ? selectedPair.seriesA[idx] : null,
      [selectedPair.teamB]: Number.isFinite(selectedPair.seriesB[idx]) ? selectedPair.seriesB[idx] : null,
      BestOfTwo:
        Number.isFinite(selectedPair.seriesA[idx]) && Number.isFinite(selectedPair.seriesB[idx])
          ? Math.max(selectedPair.seriesA[idx], selectedPair.seriesB[idx])
          : null,
    }));
  }, [selectedPair, horizonGWs]);

  const playerPoolsByTeamGw = useMemo(() => {
    const pool = new Map();

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
      const name = firstText(row?.Name, row?.name, row?.web_name);
      if (!isValidName(name)) continue;
      const gw = toNum(row?.GW, null);
      if (!isValidGW(gw)) continue;

      const teamName = resolveTeamName(row, teamLookups);
      const teamKey = normalizeTeamKey(teamName);
      if (!teamKey) continue;

      const position = firstText(row?.position, row?.Position, row?.pos, "");
      const goalPred = Math.max(0, toNum(row?.Goal_pred, row?.calc_goals, row?.goals, 0) ?? 0);
      const assistPred = Math.max(0, toNum(row?.Assist_pred, row?.calc_assists, row?.assists, 0) ?? 0);
      const minutes = Math.max(1, Math.min(95, toNum(row?.average_minutes, row?.Avg_Minutes, 75) ?? 75));
      const fixPctRaw = toNum(row?.fix_percentage, row?.Fix_percentage, 1) ?? 1;
      const fixPct = fixPctRaw > 1 ? fixPctRaw / 100 : fixPctRaw;
      const availability = Math.max(0.05, Math.min(1.1, (minutes / 90) * fixPct));

      const goalWeight = Math.max(0.005, (goalPred + 0.02) * posGoalFactor(position) * availability);
      const assistWeight = Math.max(0.005, (assistPred + 0.02) * posAssistFactor(position) * availability);

      if (!pool.has(teamKey)) pool.set(teamKey, new Map());
      const gwMap = pool.get(teamKey);
      if (!gwMap.has(gw)) gwMap.set(gw, []);
      gwMap.get(gw).push({
        name,
        position,
        goalPred: goalPred * availability,
        assistPred: assistPred * availability,
        goalWeight,
        assistWeight,
      });
    }

    return pool;
  }, [playerRows, teamLookups, statsVersion]);

  const simulatorResult = useMemo(() => {
    const fixture = predictedMatches.find((m) => m.key === selectedFixtureKey);
    if (!fixture || simRunId === 0) return null;

    const getPool = (teamName, gw) => {
      const teamKey = normalizeTeamKey(teamName);
      const byGw = playerPoolsByTeamGw.get(teamKey);
      if (!byGw || !byGw.size) return [];
      if (byGw.has(gw)) return byGw.get(gw);

      let closestGw = null;
      let minDiff = Infinity;
      byGw.forEach((_rows, k) => {
        const d = Math.abs(Number(k) - Number(gw));
        if (d < minDiff) {
          minDiff = d;
          closestGw = k;
        }
      });
      return closestGw != null ? byGw.get(closestGw) : [];
    };

    const homePlayers = getPool(fixture.home, fixture.gw);
    const awayPlayers = getPool(fixture.away, fixture.gw);
    const sumHomeGoalPred = homePlayers.reduce((acc, p) => acc + (p.goalPred || 0), 0);
    const sumAwayGoalPred = awayPlayers.reduce((acc, p) => acc + (p.goalPred || 0), 0);
    const sumHomeAssistPred = homePlayers.reduce((acc, p) => acc + (p.assistPred || 0), 0);
    const sumAwayAssistPred = awayPlayers.reduce((acc, p) => acc + (p.assistPred || 0), 0);

    const homeOppStrength = lookupStrengthForOpponent(opponentStrengthLookup, fixture.away);
    const awayOppStrength = lookupStrengthForOpponent(opponentStrengthLookup, fixture.home);
    const homeEase = Number.isFinite(homeOppStrength) ? 1 - homeOppStrength : 0.5;
    const awayEase = Number.isFinite(awayOppStrength) ? 1 - awayOppStrength : 0.5;

    const blendedHomeXg = Math.max(
      0.1,
      Math.min(4.8, fixture.homeXg * 0.7 + (sumHomeGoalPred > 0 ? sumHomeGoalPred * 0.3 : fixture.homeXg * 0.3))
    );
    const blendedAwayXg = Math.max(
      0.1,
      Math.min(4.8, fixture.awayXg * 0.7 + (sumAwayGoalPred > 0 ? sumAwayGoalPred * 0.3 : fixture.awayXg * 0.3))
    );

    const lambdaHome = Math.max(0.1, Math.min(4.8, blendedHomeXg * (0.88 + 0.32 * homeEase + 0.05)));
    const lambdaAway = Math.max(0.1, Math.min(4.8, blendedAwayXg * (0.85 + 0.3 * awayEase)));
    const homeAssistChance = Math.max(
      0.5,
      Math.min(0.92, sumHomeGoalPred > 0 ? (sumHomeAssistPred / Math.max(0.2, sumHomeGoalPred * 1.2)) : 0.72)
    );
    const awayAssistChance = Math.max(
      0.5,
      Math.min(0.92, sumAwayGoalPred > 0 ? (sumAwayAssistPred / Math.max(0.2, sumAwayGoalPred * 1.2)) : 0.72)
    );

    const rng = createRng(
      simRunId * 7919 +
        fixture.home.length * 97 +
        fixture.away.length * 193 +
        Math.round(lambdaHome * 100) * 17 +
        Math.round(lambdaAway * 100) * 31
    );

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    let over25 = 0;
    let btts = 0;
    let homeGoalsSum = 0;
    let awayGoalsSum = 0;
    const scorelineMap = new Map();
    const scorerAnyMap = new Map();
    const assisterAnyMap = new Map();
    const scorerTotalMap = new Map();
    const assisterTotalMap = new Map();

    for (let i = 0; i < simIterations; i += 1) {
      const hg = samplePoisson(lambdaHome, rng);
      const ag = samplePoisson(lambdaAway, rng);
      homeGoalsSum += hg;
      awayGoalsSum += ag;
      if (hg > ag) homeWins += 1;
      else if (ag > hg) awayWins += 1;
      else draws += 1;
      if (hg + ag >= 3) over25 += 1;
      if (hg > 0 && ag > 0) btts += 1;

      const iterationScorers = new Set();
      const iterationAssisters = new Set();

      for (let g = 0; g < hg; g += 1) {
        const scorer = pickWeighted(homePlayers, "goalWeight", rng);
        if (scorer?.name) {
          const scorerKey = `${fixture.home}__${scorer.name}`;
          scorerTotalMap.set(scorerKey, (scorerTotalMap.get(scorerKey) || 0) + 1);
          iterationScorers.add(scorerKey);
        }

        if (rng() < homeAssistChance) {
          const assist = pickWeighted(homePlayers, "assistWeight", rng, scorer?.name);
          if (assist?.name) {
            const assistKey = `${fixture.home}__${assist.name}`;
            assisterTotalMap.set(assistKey, (assisterTotalMap.get(assistKey) || 0) + 1);
            iterationAssisters.add(assistKey);
          }
        }
      }

      for (let g = 0; g < ag; g += 1) {
        const scorer = pickWeighted(awayPlayers, "goalWeight", rng);
        if (scorer?.name) {
          const scorerKey = `${fixture.away}__${scorer.name}`;
          scorerTotalMap.set(scorerKey, (scorerTotalMap.get(scorerKey) || 0) + 1);
          iterationScorers.add(scorerKey);
        }

        if (rng() < awayAssistChance) {
          const assist = pickWeighted(awayPlayers, "assistWeight", rng, scorer?.name);
          if (assist?.name) {
            const assistKey = `${fixture.away}__${assist.name}`;
            assisterTotalMap.set(assistKey, (assisterTotalMap.get(assistKey) || 0) + 1);
            iterationAssisters.add(assistKey);
          }
        }
      }

      iterationScorers.forEach((k) => scorerAnyMap.set(k, (scorerAnyMap.get(k) || 0) + 1));
      iterationAssisters.forEach((k) => assisterAnyMap.set(k, (assisterAnyMap.get(k) || 0) + 1));

      const key = `${hg}-${ag}`;
      scorelineMap.set(key, (scorelineMap.get(key) || 0) + 1);
    }

    const topScorelines = Array.from(scorelineMap.entries())
      .map(([scoreline, count]) => ({ scoreline, count, pct: (count / simIterations) * 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const toPlayerRows = (anyMap, totalMap, teamName) =>
      Array.from(anyMap.entries())
        .filter(([k]) => k.startsWith(`${teamName}__`))
        .map(([key, anyCount]) => {
          const player = key.split("__")[1];
          const totalCount = totalMap.get(key) || 0;
          return {
            player,
            anytimePct: (anyCount / simIterations) * 100,
            expected: totalCount / simIterations,
          };
        })
        .sort((a, b) => b.anytimePct - a.anytimePct || b.expected - a.expected)
        .slice(0, 8);

    return {
      fixture,
      model: {
        lambdaHome,
        lambdaAway,
        playerRowsHome: homePlayers.length,
        playerRowsAway: awayPlayers.length,
      },
      homeWinPct: (homeWins / simIterations) * 100,
      drawPct: (draws / simIterations) * 100,
      awayWinPct: (awayWins / simIterations) * 100,
      over25Pct: (over25 / simIterations) * 100,
      bttsPct: (btts / simIterations) * 100,
      avgHomeGoals: homeGoalsSum / simIterations,
      avgAwayGoals: awayGoalsSum / simIterations,
      topScorelines,
      homeScorers: toPlayerRows(scorerAnyMap, scorerTotalMap, fixture.home),
      awayScorers: toPlayerRows(scorerAnyMap, scorerTotalMap, fixture.away),
      homeAssisters: toPlayerRows(assisterAnyMap, assisterTotalMap, fixture.home),
      awayAssisters: toPlayerRows(assisterAnyMap, assisterTotalMap, fixture.away),
    };
  }, [
    predictedMatches,
    selectedFixtureKey,
    simIterations,
    simRunId,
    playerPoolsByTeamGw,
    opponentStrengthLookup,
  ]);

  const loading = statsLoading || otherLoading;
  const topSwing = fixtureDifficulty.slice(0, 8).map((r) => ({
    team: r.team,
    score: Number(r.avgEase.toFixed(2)),
  }));
  const roughSwing = [...fixtureDifficulty]
    .reverse()
    .slice(0, 8)
    .map((r) => ({
      team: r.team,
      score: Number(r.avgEase.toFixed(2)),
    }));
  const simulatorOnly = true;

  return (
    <div className="space-y-4 px-2 py-2 text-slate-800 sm:px-3">
      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Test1 - FPL Idea Lab</h1>
            <p className="mt-1 text-sm text-slate-600">
              Simulation lab for match outcomes, goal scorers, and assists using fixture + player prediction data.
            </p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            {isValidGW(upcomingGW) ? `Upcoming GW ${upcomingGW}` : "Waiting for data"}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">GW Horizon</div>
            <div className="flex flex-wrap gap-2">
              {[3, 4, 5].map((n) => (
                <Chip key={n} active={horizon === n} onClick={() => setHorizon(n)}>
                  Next {n} GW
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Differential Ownership Cap</span>
              <span className="text-emerald-700">{ownershipCap}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={ownershipCap}
              onChange={(e) => setOwnershipCap(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Position
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {positionOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Team
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {teamOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {loading && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Building Test1 analytics...
        </section>
      )}

      {!loading && simulatorOnly && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <PlayCircle size={18} className="text-indigo-600" />
            <h2 className="text-lg font-semibold">Advanced Match Simulator</h2>
          </div>
          <p className="mb-3 text-sm text-slate-600">
            Simulates matches from fixture + player predictions, then estimates scorelines, win probabilities,
            likely goal scorers, and likely assisters.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fixture
              <select
                value={selectedFixtureKey}
                onChange={(e) => setSelectedFixtureKey(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {predictedMatches.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.home} vs {m.away} ({m.homeXg.toFixed(2)} - {m.awayXg.toFixed(2)})
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Iterations</span>
                <span className="text-indigo-700">{simIterations}</span>
              </div>
              <input
                type="range"
                min={500}
                max={5000}
                step={100}
                value={simIterations}
                onChange={(e) => setSimIterations(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setSimRunId((v) => v + 1)}
                disabled={!predictedMatches.length}
                className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Run Simulation
              </button>
            </div>
          </div>

          {!simulatorResult && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Run simulation to view predictions.
            </div>
          )}

          {simulatorResult && (
            <>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <MiniStat label={`${simulatorResult.fixture.home} Win`} value={`${simulatorResult.homeWinPct.toFixed(1)}%`} tone="good" />
                <MiniStat label="Draw" value={`${simulatorResult.drawPct.toFixed(1)}%`} tone="warn" />
                <MiniStat label={`${simulatorResult.fixture.away} Win`} value={`${simulatorResult.awayWinPct.toFixed(1)}%`} tone="danger" />
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <MiniStat label="Over 2.5 Goals" value={`${simulatorResult.over25Pct.toFixed(1)}%`} tone="good" />
                <MiniStat label="BTTS" value={`${simulatorResult.bttsPct.toFixed(1)}%`} tone="warn" />
                <MiniStat
                  label="Lambda (H-A)"
                  value={`${simulatorResult.model.lambdaHome.toFixed(2)} - ${simulatorResult.model.lambdaAway.toFixed(2)}`}
                  tone="neutral"
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-2 text-sm font-semibold text-slate-700">Top Scorelines</div>
                  <table className="w-full min-w-[320px] text-sm">
                    <tbody>
                      {simulatorResult.topScorelines.map((s) => (
                        <tr key={s.scoreline} className="border-b border-slate-100">
                          <td className="py-1.5">{s.scoreline}</td>
                          <td className="py-1.5 text-right text-indigo-700 font-semibold">{s.pct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <PlayerProbTable title={`Scorers - ${simulatorResult.fixture.home}`} rows={simulatorResult.homeScorers} tone="text-emerald-700" />
                  <PlayerProbTable title={`Scorers - ${simulatorResult.fixture.away}`} rows={simulatorResult.awayScorers} tone="text-emerald-700" />
                  <PlayerProbTable title={`Assisters - ${simulatorResult.fixture.home}`} rows={simulatorResult.homeAssisters} tone="text-sky-700" />
                  <PlayerProbTable title={`Assisters - ${simulatorResult.fixture.away}`} rows={simulatorResult.awayAssisters} tone="text-sky-700" />
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {!loading && !simulatorOnly && (
        <>
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Flame size={18} className="text-orange-500" />
                <h2 className="text-lg font-semibold">Fixture Swing (Opponent Strength)</h2>
              </div>
              <p className="mb-3 text-sm text-slate-600">
                Difficulty is now based on opponent strength profile and home/away adjustment, then converted to fixture ease.
              </p>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topSwing} margin={{ top: 10, right: 8, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="team" angle={-20} textAnchor="end" interval={0} height={50} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #cbd5e1" }}
                      formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
                    />
                    <Bar dataKey="score" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Gauge size={18} className="text-rose-500" />
                <h2 className="text-lg font-semibold">Rough Patch Watch</h2>
              </div>
              <p className="mb-3 text-sm text-slate-600">
                Lowest ease teams over the selected horizon, useful for planning rotations and transfer timing.
              </p>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roughSwing} margin={{ top: 10, right: 8, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="team" angle={-20} textAnchor="end" interval={0} height={50} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #cbd5e1" }}
                      formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
                    />
                    <Bar dataKey="score" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Wand2 size={18} className="text-sky-600" />
              <h2 className="text-lg font-semibold">GW Fixture Ease Matrix</h2>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              Cell colors show team-specific ease by GW, based on opponent strength and venue.
            </p>

            <div className="overflow-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-2 text-left font-medium">Team</th>
                    {horizonGWs.map((gw) => (
                      <th key={`head_${gw}`} className="py-2 text-center font-medium">
                        GW{gw}
                      </th>
                    ))}
                    <th className="py-2 text-right font-medium">Avg Ease</th>
                    <th className="py-2 text-right font-medium">Best GW</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtureDifficulty.slice(0, 14).map((team) => (
                    <tr key={`matrix_${team.team}`} className="border-b border-slate-100">
                      <td className="py-2 font-medium text-slate-700">
                        <span className="inline-flex items-center gap-2">
                          {teamLogos[team.team] ? (
                            <img src={teamLogos[team.team]} alt={team.team} className="h-4 w-4 object-contain" />
                          ) : null}
                          {team.team}
                        </span>
                      </td>
                      {team.gwSeries.map((ease, idx) => (
                        <td key={`${team.team}_${horizonGWs[idx]}`} className="py-2 text-center">
                          <span className={`inline-flex min-w-[46px] justify-center rounded-md px-2 py-1 text-xs font-semibold ${heatColor(ease)}`}>
                            {Number.isFinite(ease) ? ease.toFixed(2) : "-"}
                          </span>
                        </td>
                      ))}
                      <td className="py-2 text-right font-semibold text-emerald-700">{team.avgEase.toFixed(2)}</td>
                      <td className="py-2 text-right">{team.bestGW ? `GW${team.bestGW}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <GitMerge size={18} className="text-amber-500" />
              <h2 className="text-lg font-semibold">Rotation Pair Studio</h2>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              Find anti-correlated teams so one team has easier fixtures when the other has harder ones.
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <MiniStat
                label="Most Anti-Correlated"
                value={antiCorrelatedPairs[0] ? `${antiCorrelatedPairs[0].teamA} + ${antiCorrelatedPairs[0].teamB}` : "-"}
                tone="danger"
              />
              <MiniStat
                label="Best Rotation Pair"
                value={bestRotationPair ? `${bestRotationPair.teamA} + ${bestRotationPair.teamB}` : "-"}
                tone="good"
              />
              <MiniStat
                label="Best Single-Team Run"
                value={fixtureDifficulty[0] ? fixtureDifficulty[0].team : "-"}
                tone="warn"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {antiCorrelatedPairs.map((pair) => (
                <Chip
                  key={pair.pairKey}
                  active={pair.pairKey === selectedPairKey}
                  onClick={() => setSelectedPairKey(pair.pairKey)}
                >
                  {pair.teamA} + {pair.teamB}
                </Chip>
              ))}
            </div>

            {selectedPair && (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    Ease Trend: {selectedPair.teamA} vs {selectedPair.teamB}
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={pairChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="gw" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: "#fff", border: "1px solid #cbd5e1" }}
                          formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)}
                        />
                        <Legend />
                        <Line type="monotone" dataKey={selectedPair.teamA} stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey={selectedPair.teamB} stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="BestOfTwo" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-2">
                  <table className="w-full min-w-[500px] text-sm">
                    <thead className="text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 text-left font-medium">Pair</th>
                        <th className="py-2 text-right font-medium">Correlation</th>
                        <th className="py-2 text-right font-medium">Rotation Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {antiCorrelatedPairs.map((pair) => (
                        <tr
                          key={pair.pairKey}
                          className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                          onClick={() => setSelectedPairKey(pair.pairKey)}
                        >
                          <td className="py-2 font-medium text-slate-700">
                            {pair.teamA} + {pair.teamB}
                          </td>
                          <td className="py-2 text-right font-semibold text-rose-700">{pair.corr.toFixed(2)}</td>
                          <td className="py-2 text-right text-emerald-700">{pair.rotationScore.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-violet-600" />
                <h2 className="text-lg font-semibold">Hidden Gem Studio</h2>
              </div>
              <div className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                Max ownership: {ownershipCap}%
              </div>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              Low-owned players with strong multi-GW projection profile. Click a player to jump to individual analysis.
            </p>

            {gemList.length ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {gemList.map((p, idx) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() =>
                      navigate("/Player_Analytics/Individual", {
                        state: { selectedPlayer: p.name },
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-800">
                          #{idx + 1} {p.name}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {p.team || "Unknown team"} · {p.position} · vs {p.opponentsText || "TBD"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                        {p.avg.toFixed(2)} avg
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <div className="text-slate-500">Upcoming</div>
                        <div className="font-semibold text-slate-800">{p.upcomingPoints.toFixed(2)}</div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <div className="text-slate-500">Ceiling</div>
                        <div className="font-semibold text-slate-800">{p.ceiling.toFixed(2)}</div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <div className="text-slate-500">Own%</div>
                        <div className="font-semibold text-violet-700">
                          {Number.isFinite(p.ownership) ? `${p.ownership.toFixed(1)}%` : "-"}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No gems found for current filters.</div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Wand2 size={18} className="text-sky-600" />
              <h2 className="text-lg font-semibold">Match Chaos Monitor</h2>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <MiniStat
                label="Most Open Game"
                value={matchChaos.open ? `${matchChaos.open.home} vs ${matchChaos.open.away}` : "-"}
                tone="good"
              />
              <MiniStat
                label="Closest Match"
                value={matchChaos.tight ? `${matchChaos.tight.home} vs ${matchChaos.tight.away}` : "-"}
                tone="warn"
              />
              <MiniStat
                label="Most One-Sided"
                value={matchChaos.oneSided ? `${matchChaos.oneSided.home} vs ${matchChaos.oneSided.away}` : "-"}
                tone="danger"
              />
            </div>

            <div className="mt-3 overflow-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-2 text-left font-medium">Fixture</th>
                    <th className="py-2 text-right font-medium">Pred Home</th>
                    <th className="py-2 text-right font-medium">Pred Away</th>
                    <th className="py-2 text-right font-medium">Total</th>
                    <th className="py-2 text-right font-medium">Difference</th>
                    <th className="py-2 text-right font-medium">Chaos</th>
                  </tr>
                </thead>
                <tbody>
                  {matchChaos.table.map((m) => (
                    <tr key={m.key} className="border-b border-slate-100">
                      <td className="py-2 font-medium text-slate-700">
                        {m.home} vs {m.away}
                      </td>
                      <td className="py-2 text-right">{m.homeGoals.toFixed(2)}</td>
                      <td className="py-2 text-right">{m.awayGoals.toFixed(2)}</td>
                      <td className="py-2 text-right text-emerald-700 font-semibold">{m.total.toFixed(2)}</td>
                      <td className="py-2 text-right">{m.diff.toFixed(2)}</td>
                      <td className="py-2 text-right font-semibold text-sky-700">{m.chaos.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <PlayCircle size={18} className="text-indigo-600" />
              <h2 className="text-lg font-semibold">Fixture Simulator</h2>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              Monte Carlo simulation using predicted goals as Poisson means. Run multiple times to stress test fixture outcomes.
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fixture
                <select
                  value={selectedFixtureKey}
                  onChange={(e) => setSelectedFixtureKey(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {predictedMatches.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.home} vs {m.away} ({m.homeXg.toFixed(2)} - {m.awayXg.toFixed(2)})
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>Iterations</span>
                  <span className="text-indigo-700">{simIterations}</span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={5000}
                  step={100}
                  value={simIterations}
                  onChange={(e) => setSimIterations(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setSimRunId((v) => v + 1)}
                  disabled={!predictedMatches.length}
                  className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Run Simulation
                </button>
              </div>
            </div>

            {!simulatorResult && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Run simulation to view probability distribution.
              </div>
            )}

            {simulatorResult && (
              <>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <MiniStat label={`${simulatorResult.fixture.home} Win`} value={`${simulatorResult.homeWinPct.toFixed(1)}%`} tone="good" />
                  <MiniStat label="Draw" value={`${simulatorResult.drawPct.toFixed(1)}%`} tone="warn" />
                  <MiniStat label={`${simulatorResult.fixture.away} Win`} value={`${simulatorResult.awayWinPct.toFixed(1)}%`} tone="danger" />
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <MiniStat label="Over 2.5 Goals" value={`${simulatorResult.over25Pct.toFixed(1)}%`} tone="good" />
                  <MiniStat label="BTTS" value={`${simulatorResult.bttsPct.toFixed(1)}%`} tone="warn" />
                  <MiniStat
                    label="Avg Scoreline"
                    value={`${simulatorResult.avgHomeGoals.toFixed(2)} - ${simulatorResult.avgAwayGoals.toFixed(2)}`}
                    tone="neutral"
                  />
                </div>

                <div className="mt-3 overflow-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 text-left font-medium">Top Scoreline</th>
                        <th className="py-2 text-right font-medium">Probability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulatorResult.topScorelines.map((s) => (
                        <tr key={s.scoreline} className="border-b border-slate-100">
                          <td className="py-2 font-medium text-slate-700">{s.scoreline}</td>
                          <td className="py-2 text-right text-indigo-700 font-semibold">{s.pct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-4 shadow-sm">
            <div className="flex items-start gap-2">
              <Gauge size={18} className="mt-0.5 text-amber-600" />
              <div>
                <h2 className="text-base font-semibold">Ideas You Can Promote To Full Features</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Opponent-strength matrix as a transfer planner, Rotation Pair Studio as a squad-depth tool,
                  Gem Studio as a scouting engine, and Fixture Simulator as a scenario sandbox.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
