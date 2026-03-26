import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarRange,
  Crown,
  Shield,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useStatsData } from "./Contexts/StatsContext";
import { useOtherData } from "./Contexts/OtherContext";
import { useAITeamData } from "./Contexts/AITeamsContext";
import teamLogos from "./utils/team_logos";

const fallbackPlayerUrl =
  "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

const toNum = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const isValidGW = (gw) => Number.isInteger(gw) && gw >= 1 && gw <= 38;

const norm = (v) => String(v ?? "").trim().toLowerCase();

const statusNorm = (s) => String(s ?? "").trim().toLowerCase();

const firstText = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

const firstFinite = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const isValidDisplayName = (name) => {
  const s = String(name ?? "").trim();
  return s !== "" && s !== "0";
};

function formatHAV(home) {
  if (home === true || home === "Home" || home === "H") return "H";
  if (home === false || home === "Away" || home === "A") return "A";
  return "-";
}

function buildFixtureLookup(fixtures, gw) {
  const map = new Map();
  for (const row of fixtures) {
    if (toNum(row?.GW, null) !== gw) continue;
    const keys = [
      row?.team_name,
      row?.team,
      row?.Team,
      row?.team_code,
      row?.code,
    ];
    for (const k of keys) {
      const nk = norm(k);
      if (!nk) continue;
      if (!map.has(nk)) map.set(nk, row);
    }
  }
  return map;
}

function summarizeCaptainReason(captain, fixtureRow) {
  const points = firstFinite(captain?.Points_prediction, captain?.calc_points, 0) ?? 0;
  const goalPred = firstFinite(captain?.Goal_pred, captain?.calc_goals, 0) ?? 0;
  const assistPred = firstFinite(captain?.Assist_pred, captain?.calc_assists, 0) ?? 0;
  const teamXG = firstFinite(fixtureRow?.XG, null);
  const cs = firstFinite(fixtureRow?.CS, null);

  const reasons = [];
  reasons.push(`Projected return this week: ${points.toFixed(2)} points.`);

  const involvement = goalPred + assistPred;
  if (involvement >= 1.1) {
    reasons.push(
      `Strong attacking projection (${goalPred.toFixed(2)} goals + ${assistPred.toFixed(
        2
      )} assists).`
    );
  } else if (involvement >= 0.7) {
    reasons.push(
      `Solid goal involvement projection (${goalPred.toFixed(2)} + ${assistPred.toFixed(2)}).`
    );
  }

  if (Number.isFinite(teamXG)) {
    if (teamXG >= 1.7) reasons.push(`Team attacking outlook is strong (XG ${teamXG.toFixed(2)}).`);
    else if (teamXG >= 1.3) reasons.push(`Team has a decent scoring setup (XG ${teamXG.toFixed(2)}).`);
  }

  if (Number.isFinite(cs)) {
    const csPct = cs > 1 ? cs : cs * 100;
    if (csPct >= 35) reasons.push(`Extra clean-sheet upside in the fixture (${csPct.toFixed(0)}%).`);
  }

  return reasons.slice(0, 3);
}

function playerName(p) {
  return firstText(p?.web_name, p?.Name, p?.name, "Unknown");
}

function playerTeamName(p, fixtureMap) {
  const keys = [p?.team_name, p?.Team, p?.team, p?.team_code];
  for (const key of keys) {
    const fx = fixtureMap.get(norm(key));
    if (fx?.team_name) return fx.team_name;
  }
  return firstText(p?.team_name, p?.Team, p?.team, "Unknown team");
}

function resolveFixtureForPlayer(p, fixtureMap) {
  const keys = [p?.team_name, p?.Team, p?.team, p?.team_code];
  for (const key of keys) {
    const fx = fixtureMap.get(norm(key));
    if (fx) return fx;
  }
  return null;
}

export default function WeeklyReview() {
  const navigate = useNavigate();
  const { fetchIfNeeded: fetchStatsIfNeeded, loading: statsLoading, PlayersData } = useStatsData();
  const {
    fetchIfNeeded: fetchOtherIfNeeded,
    loading: otherLoading,
    FixtureData,
    SeasonData,
  } = useOtherData();
  const { fetchIfNeeded: fetchAiIfNeeded, loading: aiLoading, freeHitData } = useAITeamData();

  useEffect(() => {
    (async () => {
      await Promise.all([fetchStatsIfNeeded?.(), fetchOtherIfNeeded?.(), fetchAiIfNeeded?.()]);
    })();
  }, [fetchStatsIfNeeded, fetchOtherIfNeeded, fetchAiIfNeeded]);

  const upcomingGW = useMemo(() => {
    const fixtureRows = Array.isArray(FixtureData?.current) ? FixtureData.current : [];
    const gws = fixtureRows.map((r) => toNum(r?.GW, null)).filter((gw) => isValidGW(gw));
    if (!gws.length) return null;
    return Math.min(...gws);
  }, [FixtureData]);

  const upcomingFixtures = useMemo(() => {
    if (!isValidGW(upcomingGW)) return [];
    const fixtureRows = Array.isArray(FixtureData?.current) ? FixtureData.current : [];
    return fixtureRows.filter((r) => toNum(r?.GW, null) === upcomingGW);
  }, [FixtureData, upcomingGW]);

  const fixtureLookup = useMemo(
    () => buildFixtureLookup(upcomingFixtures, upcomingGW),
    [upcomingFixtures, upcomingGW]
  );

  const captainPicks = useMemo(() => {
    if (!isValidGW(upcomingGW)) return [];
    const playerRows = Array.isArray(PlayersData?.current) ? PlayersData.current : [];
    const candidates = playerRows
      .filter((p) => toNum(p?.GW, null) === upcomingGW)
      .map((p) => ({
        row: p,
        points: firstFinite(p?.Points_prediction, p?.calc_points, null),
      }))
      .filter((x) => Number.isFinite(x.points))
      .sort((a, b) => b.points - a.points);
    return candidates.slice(0, 3).map((c, idx) => {
      const fixture = resolveFixtureForPlayer(c.row, fixtureLookup);
      return {
        rank: idx + 1,
        row: c.row,
        points: c.points,
        fixture,
        reasons: summarizeCaptainReason(c.row, fixture),
      };
    });
  }, [PlayersData, upcomingGW, fixtureLookup]);

  const bestAttackingFixtures = useMemo(() => {
    return [...upcomingFixtures]
      .map((r) => ({
        team: firstText(r?.team_name, r?.team, r?.Team),
        opponent: firstText(r?.opponent_name, r?.Opponent_team, "TBD"),
        hav: formatHAV(r?.Home),
        score: firstFinite(r?.XG, null),
      }))
      .filter((r) => r.team && Number.isFinite(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [upcomingFixtures]);

  const bestDefensiveFixtures = useMemo(() => {
    return [...upcomingFixtures]
      .map((r) => ({
        team: firstText(r?.team_name, r?.team, r?.Team),
        opponent: firstText(r?.opponent_name, r?.Opponent_team, "TBD"),
        hav: formatHAV(r?.Home),
        score: firstFinite(r?.CS, null),
      }))
      .filter((r) => r.team && Number.isFinite(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [upcomingFixtures]);

  const playerDeltasLastGW = useMemo(() => {
    const seasonRows = Array.isArray(SeasonData?.current) ? SeasonData.current : [];
    const playerOnly = seasonRows.filter(
      (r) =>
        statusNorm(r?.Type ?? r?.type) === "players" &&
        isValidGW(toNum(r?.GW, null)) &&
        isValidDisplayName(firstText(r?.web_name, r?.Full_Name, r?.name))
    );
    if (!playerOnly.length) return { gw: null, underRows: [], overRows: [] };

    const gw = Math.max(...playerOnly.map((r) => Number(r.GW)));
    const forGW = playerOnly.filter((r) => Number(r.GW) === gw);

    const rows = forGW
      .map((r) => {
        const displayName = firstText(r?.web_name, r?.Full_Name, r?.name);
        const xgiDelta = firstFinite(
          r?.XGI_delta,
          (toNum(r?.goals_scored, 0) - toNum(r?.expected_goals, 0)) +
            (toNum(r?.assists, 0) - toNum(r?.expected_assists, 0)),
          null
        );

        return {
          name: displayName,
          team: firstText(r?.team_name, r?.Team, r?.team),
          xgiDelta,
          points: toNum(r?.total_points, 0),
        };
      })
      .filter((r) => isValidDisplayName(r.name) && Number.isFinite(r.xgiDelta));

    const underRows = rows
      .filter((r) => r.xgiDelta < 0)
      .sort((a, b) => a.xgiDelta - b.xgiDelta)
      .slice(0, 8);

    const overRows = rows
      .filter((r) => r.xgiDelta > 0)
      .sort((a, b) => b.xgiDelta - a.xgiDelta)
      .slice(0, 8);

    return { gw, underRows, overRows };
  }, [SeasonData]);

  const freeHitLineup = useMemo(() => {
    const freeHitRows = Array.isArray(freeHitData?.current) ? freeHitData.current : [];
    const valid = freeHitRows.filter((r) => isValidGW(toNum(r?.GW, null)));
    if (!valid.length) return { gw: null, playing: [] };

    const gws = Array.from(new Set(valid.map((r) => Number(r.GW)))).sort((a, b) => a - b);
    const targetGW = isValidGW(upcomingGW) && gws.includes(upcomingGW) ? upcomingGW : gws[0];

    const forGW = valid.filter((r) => Number(r.GW) === targetGW);
    const playing = forGW.filter((r) => statusNorm(r?.status) === "playing");

    return { gw: targetGW, playing };
  }, [freeHitData, upcomingGW]);

  const loading = statsLoading || otherLoading || aiLoading;

  return (
    <div className="space-y-4 px-2 py-2 text-slate-800 sm:px-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Weekly Review</h1>
            <p className="text-sm text-slate-600 mt-1">
              Upcoming GW insights for captaincy, fixtures, player form, and AI team setup.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 bg-slate-50">
            <CalendarRange size={15} />
            {isValidGW(upcomingGW) ? `Upcoming GW ${upcomingGW}` : "Upcoming GW unavailable"}
          </div>
        </div>
      </section>

      {loading && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Building weekly review...
        </section>
      )}

      {!loading && (
        <>
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Crown size={18} className="text-amber-500" />
                <h2 className="text-lg font-semibold">Top 3 Captain Picks</h2>
              </div>

              {captainPicks.length ? (
                <div className="space-y-3">
                  {captainPicks.map((pick) => (
                    <div key={`${playerName(pick.row)}_${pick.rank}`} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-6 min-w-6 px-2 rounded-full bg-amber-100 text-amber-700 text-xs font-bold inline-flex items-center justify-center">
                          #{pick.rank}
                        </div>
                        <img
                          src={pick.row.photo}
                          alt={playerName(pick.row)}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = fallbackPlayerUrl;
                          }}
                          className="h-12 w-12 rounded-full object-cover border border-slate-200"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-base truncate">{playerName(pick.row)}</div>
                          <div className="text-sm text-slate-600 truncate">
                            {playerTeamName(pick.row, fixtureLookup)}
                            {pick.fixture && (
                              <>
                                {" · "}
                                vs {firstText(pick.fixture?.opponent_name, pick.fixture?.Opponent_team, "TBD")} (
                                {formatHAV(pick.fixture?.Home)})
                              </>
                            )}
                          </div>
                        </div>
                        <div className="ml-auto rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-900 text-sm font-semibold whitespace-nowrap">
                          {pick.points.toFixed(2)} pts
                        </div>
                      </div>
                      <ul className="mt-2 space-y-1 text-sm text-slate-700">
                        {pick.reasons.map((r, i) => (
                          <li key={`cap_reason_${pick.rank}_${i}`}>• {r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">No captain projection available.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={18} className="text-sky-600" />
                <h2 className="text-lg font-semibold">Best Team Fixtures</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FixtureList
                  title="Attacking (XG)"
                  rows={bestAttackingFixtures}
                  valueLabel={(v) => v.toFixed(2)}
                />
                <FixtureList
                  title="Defensive (CS)"
                  rows={bestDefensiveFixtures}
                  valueLabel={(v) => {
                    const pct = v > 1 ? v : v * 100;
                    return `${pct.toFixed(0)}%`;
                  }}
                />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown size={18} className="text-rose-500" />
                <h2 className="text-lg font-semibold">
                  Underachieved Last GW{isValidGW(playerDeltasLastGW.gw) ? ` (${playerDeltasLastGW.gw})` : ""}
                </h2>
              </div>

              {playerDeltasLastGW.underRows.length ? (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 font-medium">Player</th>
                        <th className="text-left py-2 font-medium">Team</th>
                        <th className="text-right py-2 font-medium">XGI Delta</th>
                        <th className="text-right py-2 font-medium">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerDeltasLastGW.underRows.map((r, idx) => (
                        <tr key={`${r.name}_${idx}`} className="border-b border-slate-100">
                          <td className="py-2">{r.name}</td>
                          <td className="py-2 text-slate-600">{r.team || "-"}</td>
                          <td className="py-2 text-right text-rose-600 font-semibold">
                            {r.xgiDelta.toFixed(2)}
                          </td>
                          <td className="py-2 text-right">{r.points.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-slate-500">No underachievement rows found.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={18} className="text-emerald-500" />
                <h2 className="text-lg font-semibold">
                  Overachieved Last GW{isValidGW(playerDeltasLastGW.gw) ? ` (${playerDeltasLastGW.gw})` : ""}
                </h2>
              </div>

              {playerDeltasLastGW.overRows.length ? (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 font-medium">Player</th>
                        <th className="text-left py-2 font-medium">Team</th>
                        <th className="text-right py-2 font-medium">XGI Delta</th>
                        <th className="text-right py-2 font-medium">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerDeltasLastGW.overRows.map((r, idx) => (
                        <tr key={`${r.name}_${idx}`} className="border-b border-slate-100">
                          <td className="py-2">{r.name}</td>
                          <td className="py-2 text-slate-600">{r.team || "-"}</td>
                          <td className="py-2 text-right text-emerald-600 font-semibold">
                            +{r.xgiDelta.toFixed(2)}
                          </td>
                          <td className="py-2 text-right">{r.points.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-slate-500">No overachievement rows found.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={18} className="text-emerald-600" />
                <h2 className="text-lg font-semibold">
                  Team Of The Week (Free Hit){isValidGW(freeHitLineup.gw) ? ` · GW ${freeHitLineup.gw}` : ""}
                </h2>
              </div>

              {freeHitLineup.playing.length ? (
                <div className="space-y-3">
                  {["GKP", "DEF", "MID", "FWD"].map((pos) => {
                    const players = freeHitLineup.playing.filter((p) => p.position === pos);
                    if (!players.length) return null;
                    return (
                      <PositionLine key={pos} label={pos} players={players} navigate={navigate} />
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-slate-500">No free-hit lineup available.</div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function FixtureList({ title, rows, valueLabel }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-semibold mb-2 text-slate-700">{title}</div>
      <div className="space-y-2">
        {rows.length ? (
          rows.map((r, idx) => (
            <div
              key={`${r.team}_${idx}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                {teamLogos[r.team] ? (
                  <img src={teamLogos[r.team]} alt={r.team} className="h-5 w-5 object-contain" />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-slate-200" />
                )}
                <div className="text-sm truncate">
                  <span className="font-medium">{r.team}</span>
                  <span className="text-slate-500"> vs {r.opponent} ({r.hav})</span>
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-800">{valueLabel(r.score)}</div>
            </div>
          ))
        ) : (
          <div className="text-sm text-slate-500">No fixture rows.</div>
        )}
      </div>
    </div>
  );
}

function PositionLine({ label, players, navigate, isBench = false }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-2">
        {players.map((p, idx) => (
          <button
            key={`${playerName(p)}_${idx}`}
            type="button"
            onClick={() =>
              navigate("/Player_Analytics/Individual", {
                state: { selectedPlayer: p.Name },
              })
            }
            className={[
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm transition",
              isBench
                ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
            ].join(" ")}
          >
            <img
              src={p.photo}
              alt={playerName(p)}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = fallbackPlayerUrl;
              }}
              className="h-6 w-6 rounded-full object-cover"
            />
            <span>{playerName(p)}</span>
            {p.Is_captain && <span className="text-[11px] font-bold text-amber-600">C</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
