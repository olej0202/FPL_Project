import React, { useEffect, useMemo, useState } from "react";
import { PlayCircle } from "lucide-react";
import { useAdjustmentData, fixtureIdFromRow } from "./Contexts/AdjustmentsContext";
import teamLogos from "./utils/team_logos";

const toNum = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
  const [simIterations, setSimIterations] = useState(1500);
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
      const goalPred = Math.max(0, toNum(row?.calc_goals, row?.Goal_pred, row?.goals, 0) ?? 0);
      const assistPred = Math.max(0, toNum(row?.calc_assists, row?.Assist_pred, row?.assists, 0) ?? 0);
      const minutes = Math.max(
        1,
        Math.min(95, toNum(row?.calc_minutes, row?.average_minutes, row?.Avg_Minutes, 75) ?? 75)
      );
      const availability = Math.max(0.05, Math.min(1.1, minutes / 90));

      const goalWeight = Math.max(0.005, (goalPred + 0.02) * posGoalFactor(position) * availability);
      const assistWeight = Math.max(0.005, (assistPred + 0.02) * posAssistFactor(position) * availability);

      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        name,
        goalPred: goalPred * availability,
        assistPred: assistPred * availability,
        goalWeight,
        assistWeight,
      });
    }

    return map;
  }, [playerRows, selectedGW, dataVersion, teamNameLookup]);

  const simulationResult = useMemo(() => {
    const fx = fixturesForGW.find((f) => f.id === selectedFixtureId);
    if (!fx || simRunId === 0) return null;

    const homeXgRaw = Math.max(0.1, toNum(fx?.homeRow?.XG, 1.2) ?? 1.2);
    const awayXgRaw = Math.max(0.1, toNum(fx?.awayRow?.XG, 1.0) ?? 1.0);
    const homeCsRaw = clamp(toNum(fx?.homeRow?.CS, 0.3) ?? 0.3, 0.03, 0.97);
    const awayCsRaw = clamp(toNum(fx?.awayRow?.CS, 0.3) ?? 0.3, 0.03, 0.97);

    const homePool = playerPoolByTeam.get(normalizeTeamKey(fx.homeTeam)) || [];
    const awayPool = playerPoolByTeam.get(normalizeTeamKey(fx.awayTeam)) || [];
    const sumHomeGoals = homePool.reduce((acc, p) => acc + (p.goalPred || 0), 0);
    const sumAwayGoals = awayPool.reduce((acc, p) => acc + (p.goalPred || 0), 0);
    const sumHomeAssists = homePool.reduce((acc, p) => acc + (p.assistPred || 0), 0);
    const sumAwayAssists = awayPool.reduce((acc, p) => acc + (p.assistPred || 0), 0);

    // Blend team XG, opponent CS-implied goals-conceded, and player-goal signal.
    const homeConcedeFromAwayCs = -Math.log(awayCsRaw);
    const awayConcedeFromHomeCs = -Math.log(homeCsRaw);
    const homePlayerSignal = sumHomeGoals > 0 ? sumHomeGoals : homeXgRaw;
    const awayPlayerSignal = sumAwayGoals > 0 ? sumAwayGoals : awayXgRaw;

    const lambdaHome = clamp(
      (homeXgRaw * 0.56 + homeConcedeFromAwayCs * 0.24 + homePlayerSignal * 0.2) * 1.06,
      0.1,
      4.8
    );
    const lambdaAway = clamp(
      (awayXgRaw * 0.56 + awayConcedeFromHomeCs * 0.24 + awayPlayerSignal * 0.2) * 0.94,
      0.1,
      4.8
    );

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

    for (let i = 0; i < simIterations; i += 1) {
      const hg = samplePoisson(lambdaHome, rng);
      const ag = samplePoisson(lambdaAway, rng);

      homeGoalsSum += hg;
      awayGoalsSum += ag;
      if (hg > ag) homeWins += 1;
      else if (ag > hg) awayWins += 1;
      else draws += 1;
      if (ag === 0) homeCleanSheets += 1;
      if (hg === 0) awayCleanSheets += 1;
      if (hg + ag >= 3) over25 += 1;
      if (hg > 0 && ag > 0) btts += 1;

      const iterationScorers = new Set();
      const iterationAssisters = new Set();

      for (let g = 0; g < hg; g += 1) {
        const scorer = pickWeighted(homePool, "goalWeight", rng);
        if (scorer?.name) {
          const key = `${fx.homeTeam}__${scorer.name}`;
          scorerTotalMap.set(key, (scorerTotalMap.get(key) || 0) + 1);
          iterationScorers.add(key);
        }
        if (rng() < homeAssistChance) {
          const assist = pickWeighted(homePool, "assistWeight", rng, scorer?.name);
          if (assist?.name) {
            const key = `${fx.homeTeam}__${assist.name}`;
            assisterTotalMap.set(key, (assisterTotalMap.get(key) || 0) + 1);
            iterationAssisters.add(key);
          }
        }
      }

      for (let g = 0; g < ag; g += 1) {
        const scorer = pickWeighted(awayPool, "goalWeight", rng);
        if (scorer?.name) {
          const key = `${fx.awayTeam}__${scorer.name}`;
          scorerTotalMap.set(key, (scorerTotalMap.get(key) || 0) + 1);
          iterationScorers.add(key);
        }
        if (rng() < awayAssistChance) {
          const assist = pickWeighted(awayPool, "assistWeight", rng, scorer?.name);
          if (assist?.name) {
            const key = `${fx.awayTeam}__${assist.name}`;
            assisterTotalMap.set(key, (assisterTotalMap.get(key) || 0) + 1);
            iterationAssisters.add(key);
          }
        }
      }

      iterationScorers.forEach((k) => scorerAnyMap.set(k, (scorerAnyMap.get(k) || 0) + 1));
      iterationAssisters.forEach((k) => assisterAnyMap.set(k, (assisterAnyMap.get(k) || 0) + 1));

      const scorelineKey = `${hg}-${ag}`;
      scorelineMap.set(scorelineKey, (scorelineMap.get(scorelineKey) || 0) + 1);
    }

    const topScorelines = Array.from(scorelineMap.entries())
      .map(([scoreline, count]) => ({ scoreline, count, pct: (count / simIterations) * 100 }))
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
            anytimePct: (anyCount / simIterations) * 100,
            expected: totalCount / simIterations,
          };
        })
        .sort((a, b) => b.anytimePct - a.anytimePct || b.expected - a.expected)
        .slice(0, 8);

    return {
      fixture: fx,
      model: {
        lambdaHome,
        lambdaAway,
        xgHome: homeXgRaw,
        xgAway: awayXgRaw,
        playerRowsHome: homePool.length,
        playerRowsAway: awayPool.length,
      },
      homeWinPct: pct(homeWins, simIterations),
      drawPct: pct(draws, simIterations),
      awayWinPct: pct(awayWins, simIterations),
      over25Pct: pct(over25, simIterations),
      bttsPct: pct(btts, simIterations),
      homeCsPct: pct(homeCleanSheets, simIterations),
      awayCsPct: pct(awayCleanSheets, simIterations),
      avgHomeGoals: homeGoalsSum / simIterations,
      avgAwayGoals: awayGoalsSum / simIterations,
      predictedAvgScoreline: `${Math.round(homeGoalsSum / simIterations)}-${Math.round(awayGoalsSum / simIterations)}`,
      mostLikelyScoreline: topScoreline?.scoreline || "N/A",
      mostLikelyScorelinePct: topScoreline?.pct || 0,
      topScorelines,
      homeScorers: toPlayerRows(scorerAnyMap, scorerTotalMap, fx.homeTeam),
      awayScorers: toPlayerRows(scorerAnyMap, scorerTotalMap, fx.awayTeam),
      homeAssisters: toPlayerRows(assisterAnyMap, assisterTotalMap, fx.homeTeam),
      awayAssisters: toPlayerRows(assisterAnyMap, assisterTotalMap, fx.awayTeam),
    };
  }, [fixturesForGW, selectedFixtureId, simRunId, simIterations, playerPoolByTeam]);

  if (loading && !teamRows.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading simulator...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <PlayCircle size={18} className="text-indigo-600" />
          <h2 className="text-lg font-semibold">Simulator</h2>
        </div>
        <p className="mb-3 text-sm text-slate-600">
          Match simulation using the statistical model with team outcomes, clean-sheet odds, scorelines, scorers, and assisters.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            GW
            <select
              value={selectedGW}
              onChange={(e) => setSelectedGW(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {fixturesForGW.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.homeTeam} vs {f.awayTeam} ({(f.probability * 100).toFixed(0)}%)
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
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setSimRunId((v) => v + 1)}
            disabled={!fixturesForGW.length}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                Model base XG: {simulationResult.model.xgHome.toFixed(2)} - {simulationResult.model.xgAway.toFixed(2)} | Lambda:{" "}
                {simulationResult.model.lambdaHome.toFixed(2)} - {simulationResult.model.lambdaAway.toFixed(2)}
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
