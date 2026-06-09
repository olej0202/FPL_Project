import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import teamLogos from "./utils/team_logos";
import { useAdjustmentData, fixtureIdFromRow } from "./Contexts/AdjustmentsContext";

const PALETTE = {
  red: "#f8fafc",
  gold: "#76AFA0",
  black: "#e2e8f0",
  beige: "#1e293b",
};

// Quick rollback switch for GW-specific adjustment mode.
const ENABLE_GW_ADJUST = true;

const normalizeName = (s) => String(s ?? "").trim().toLowerCase();

const applyTeamStrengthAdjustments = (rows, teamName, newXg, newXgc, scope = "all", gw = null) => {
  const target = normalizeName(teamName);
  const useGwScope = scope === "gw" && Number.isFinite(Number(gw));
  const targetGw = Number(gw);

  return rows.map((r) => {
    const clone = { ...r };
    const ownName = normalizeName(clone.team_name);
    const oppName = normalizeName(clone.opponent_team);
    const rowGw = Number(clone.GW);

    const gwMatch = !useGwScope || rowGw === targetGw;

    const base_own_XG_avg =
      clone.base_own_XG_avg != null ? clone.base_own_XG_avg : clone.own_XG_avg;
    const base_own_XGC_avg =
      clone.base_own_XGC_avg != null ? clone.base_own_XGC_avg : clone.own_XGC_avg;

    if (gwMatch && ownName === target) {
      clone.own_XG_avg = newXg;
      clone.own_XGC_avg = newXgc;
    }

    if (gwMatch && oppName === target) {
      clone.opponent_XG_avg = newXg;
      clone.opponent_XGC_avg = newXgc;
    }

    return { ...clone, base_own_XG_avg, base_own_XGC_avg };
  });
};

  function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);

  return matches;
}
function TeamAdjustmentsPage() {
  const {
    fetchIfNeeded,
    loading,
    Teamdata,
    updateTeamData,
    dataVersion,
    forceRefetch,
    Fixtures,
    fixturesVersion,
    trackAdjustmentChanges,
  } = useAdjustmentData();

  const [data, setData] = useState([]);
  const [resetting, setResetting] = useState(false);
  const [adjustScope, setAdjustScope] = useState("all"); // 'all' | 'gw'
  const [selectedGW, setSelectedGW] = useState(null);

  // --- Helper to (re)initialize from context data ---
  const initializeFromContext = (raw) => {
    if (!raw || !Array.isArray(raw)) return;

    const cleaned = raw.map((r) => ({
      ...r,
      GW: Number(r.GW),
      XG: Number(r.XG ?? 0),
      CS: Number(r.CS ?? 0),
      team_name: r.team_name,
      opponent_team: r.Opponent_team,
      Home: r.Home,
      own_XG_avg: Number(r.own_XG_avg ?? 0),
      own_XGC_avg: Number(r.own_XGC_avg ?? 0),
      own_H_Att_E: Number(r.own_H_Att_E ?? 0),
      own_H_def_E: Number(r.own_H_def_E ?? 0),
      opponent_XG_avg: Number(r.opponent_XG_avg ?? 0),
      opponent_XGC_avg: Number(r.opponent_XGC_avg ?? 0),
      opponent_H_Att_E: Number(r.opponent_H_Att_E ?? 0),
      opponent_H_def_E: Number(r.opponent_H_def_E ?? 0),

      base_own_XG_avg: r.base_own_XG_avg != null ? Number(r.base_own_XG_avg) : null,
      base_own_XGC_avg: r.base_own_XGC_avg != null ? Number(r.base_own_XGC_avg) : null,
    }));

    const withMetrics = recomputeMetrics(cleaned);
    setData(withMetrics);
    updateTeamData(withMetrics);
  };


  // Initial fetch
  useEffect(() => {
    (async () => {
      await fetchIfNeeded();
      if (!data.length && Teamdata.current) {
        initializeFromContext(Teamdata.current);
      }
    })();
  }, [fetchIfNeeded, Teamdata, data.length, dataVersion]);

  // Unique team points for scatter (read baseline from data rows)
  const teamPoints = useMemo(() => {
    const grouped = new Map();
    for (const r of data) {
      if (!grouped.has(r.team_name)) grouped.set(r.team_name, []);
      grouped.get(r.team_name).push(r);
    }

    const useGwScope =
      ENABLE_GW_ADJUST &&
      adjustScope === "gw" &&
      Number.isFinite(Number(selectedGW));
    const targetGw = Number(selectedGW);

    const out = [];
    for (const [teamName, rows] of grouped.entries()) {
      const chosen =
        useGwScope && rows.some((r) => Number(r.GW) === targetGw)
          ? rows.find((r) => Number(r.GW) === targetGw)
          : rows[0];

      if (!chosen) continue;

      const origX =
        chosen.base_own_XG_avg != null ? chosen.base_own_XG_avg : chosen.own_XG_avg;
      const origY =
        chosen.base_own_XGC_avg != null ? chosen.base_own_XGC_avg : chosen.own_XGC_avg;

      out.push({
        team_name: teamName,
        own_XG_avg: chosen.own_XG_avg,
        own_XGC_avg: chosen.own_XGC_avg,
        orig_XG_avg: origX,
        orig_XGC_avg: origY,
        logo: teamLogos[teamName] || null,
      });
    }

    return out;
  }, [data, adjustScope, selectedGW]);

  // Table data: gws, teams, rowMap, totals per team
  const tableData = useMemo(() => {
    const fixtures = Fixtures?.current || [];

    // fixtureId -> options[]
    const optionsById = new Map();
    for (const fx of fixtures) {
      optionsById.set(
        fx.id,
        (fx.options || []).map((o) => ({
          gw: Number(o.gw),
          p: Number(o.p),
        }))
      );
    }

    const teams = Array.from(new Set(data.map((r) => r.team_name))).sort();

    // Collect all GWs that appear in any option (fallback to row.GW if no fixture exists)
    const gwSet = new Set();
    for (const r of data) {
      const id = fixtureIdFromRow({ ...r, Opponent_team: r.Opponent_team });

      const opts = optionsById.get(id);
      if (opts && opts.length) {
        for (const o of opts) {
          if (Number.isFinite(o.gw)) gwSet.add(o.gw);
        }
      } else {
        const gw = Number(r.GW);
        if (Number.isFinite(gw)) gwSet.add(gw);
      }
    }
    const gws = Array.from(gwSet)
      .filter((gw) => Number.isFinite(gw) && gw >= 1 && gw <= 38)
      .sort((a, b) => a - b);

    const key = (team, gw) => `${team}__${gw}`;

    // cellMap: for each team+gw store expectedXG/expectedCS and opponent breakdown
    const cellMap = new Map();

    const formatHAV = (Home) => {
      if (Home === true || Home === "Home" || Home === "H") return "H";
      if (Home === false || Home === "Away" || Home === "A") return "A";
      return "-";
    };

    const addToCell = (team, gw, { expectedXG, expectedCS, opp, hav, p }) => {
      const k = key(team, gw);
      const cur =
        cellMap.get(k) || {
          expectedXG: 0,
          expectedCS: 0,
          probMass: 0,
          opps: [], // { opp, hav, p }
        };

      cur.expectedXG += expectedXG;
      cur.expectedCS += expectedCS;
      cur.probMass += p;

      const i = cur.opps.findIndex((x) => x.opp === opp && x.hav === hav);
      if (i === -1) cur.opps.push({ opp, hav, p });
      else cur.opps[i] = { ...cur.opps[i], p: cur.opps[i].p + p };

      cellMap.set(k, cur);
    };

    for (const r of data) {
      const xg = Number.isFinite(r.XG) ? r.XG : 0;
      const cs = Number.isFinite(r.CS) ? r.CS : 0;

      const oppName = r.Opponent_team || r.opponent_team || "TBD";
      const hav = formatHAV(r.Home);

      const id = fixtureIdFromRow({ ...r, Opponent_team: r.Opponent_team });

      const dist =
        optionsById.get(id)?.length ? optionsById.get(id) : [{ gw: Number(r.GW), p: 1 }];

      for (const o of dist) {
        const gw = Number(o.gw);
        const p = Number(o.p);
        if (!Number.isFinite(gw) || !Number.isFinite(p) || p <= 0) continue;

        addToCell(r.team_name, gw, {
          expectedXG: p * xg,
          expectedCS: p * cs,
          opp: oppName,
          hav,
          p,
        });
      }
    }

    // totals (full horizon)
    const totalsByTeam = {};
    for (const team of teams) {
      let totalXG = 0;
      let sumExpectedCS = 0;
      let gwCount = 0;

      for (const gw of gws) {
        const c = cellMap.get(key(team, gw));
        if (!c) continue;
        totalXG += c.expectedXG;
        sumExpectedCS += c.expectedCS;
        gwCount += 1;
      }

      totalsByTeam[team] = {
        totalXG,
        avgCS: gwCount ? sumExpectedCS / gwCount : 0,
      };
    }

    return { gws, teams, cellMap, totalsByTeam };
  }, [data, Fixtures, fixturesVersion]);

  // When user drags a team in the scatter
  const handleTeamDrag = useCallback((teamName, newXg, newXgc) => {
    const useGwScope =
      ENABLE_GW_ADJUST &&
      adjustScope === "gw" &&
      Number.isFinite(Number(selectedGW));

    if (ENABLE_GW_ADJUST && adjustScope === "gw" && !useGwScope) return;

    const rows = Array.isArray(data) ? data : [];
    const target = normalizeName(teamName);
    const relevantRows = rows.filter((r) => {
      const ownName = normalizeName(r.team_name);
      if (ownName !== target) return false;
      if (!useGwScope) return true;
      return Number(r.GW) === Number(selectedGW);
    });

    const avgOf = (arr, field) => {
      if (!arr.length) return null;
      const sum = arr.reduce((acc, r) => acc + (Number.isFinite(Number(r[field])) ? Number(r[field]) : 0), 0);
      return sum / arr.length;
    };

    const oldXg = avgOf(relevantRows, "own_XG_avg");
    const oldXgc = avgOf(relevantRows, "own_XGC_avg");

    const updated = applyTeamStrengthAdjustments(
      rows,
      teamName,
      newXg,
      newXgc,
      useGwScope ? "gw" : "all",
      useGwScope ? Number(selectedGW) : null
    );

    const withMetrics = recomputeMetrics(updated);
    setData(withMetrics);
    updateTeamData(withMetrics);

    trackAdjustmentChanges?.("team", [
      {
        type: "Team_strength",
        teamName,
        scope: useGwScope ? "gw" : "all",
        gw: useGwScope ? Number(selectedGW) : null,
        oldValue: oldXg,
        newValue: Number(newXg),
        oldDefValue: oldXgc,
        newDefValue: Number(newXgc),
      },
    ]);
  }, [adjustScope, data, selectedGW, trackAdjustmentChanges, updateTeamData]);

  useEffect(() => {
    const gws = tableData?.gws || [];
    if (!gws.length) {
      setSelectedGW(null);
      return;
    }

    setSelectedGW((prev) => {
      const prevNum = Number(prev);
      if (Number.isFinite(prevNum) && gws.includes(prevNum)) return prevNum;
      return gws[0];
    });
  }, [tableData?.gws]);

  // Reset button: refetch and reset
  const handleReset = async () => {
    try {
      setResetting(true);
      setData([]);
      await forceRefetch();
    } catch (e) {
      console.error("Failed to reset:", e);
    } finally {
      setResetting(false);
    }
  };

  if ((loading && data.length === 0) || resetting) {
    return (
      <div
        style={{
          padding: "2rem",
          minHeight: "100vh",
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        Loading team data…
      </div>
    );
  }

  if (!loading && data.length === 0) {
    return (
      <div
        style={{
          padding: "2rem",
          minHeight: "100vh",
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        No data found.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "1.5rem",
        minHeight: "100vh",
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #e2e8f0 100%)`,
        color: PALETTE.beige,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <header
        style={{
          marginBottom: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>Team Adjustment Tool</h1>
            <p
              style={{
                marginTop: "0.25rem",
                fontSize: "0.85rem",
                color: "#64748b",
                maxWidth: "640px",
              }}
            >
              Drag a team in the scatter plot to adjust its <b>Offensive</b> and <b>Defensive</b> strength. Use
              <b> Adjustment Scope</b> and <b> GW selector</b> to update the full horizon or a single GW.
            </p>
          </div>

          <button
            onClick={handleReset}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "999px",
              border: `1px solid ${PALETTE.gold}`,
              background: "linear-gradient(135deg, rgba(236,253,245,0.95), rgba(248,250,252,0.95))",
              color: PALETTE.beige,
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 500,
              boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>⟳</span>
            <span>Reset data</span>
          </button>
        </div>
      </header>

      {ENABLE_GW_ADJUST && (
        <section
          style={{
            marginBottom: "1rem",
            borderRadius: 14,
            border: "1px solid #d5dee9",
            background: "#ffffff",
            padding: "10px 14px",
            boxShadow: "0 10px 22px rgba(15,23,42,0.06)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Adjustment Scope</span>
          <div style={{ display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 999, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setAdjustScope("all")}
              style={{
                padding: "5px 10px",
                fontSize: 12,
                border: "none",
                background: adjustScope === "all" ? "rgba(61,120,108,0.16)" : "#f8fafc",
                color: adjustScope === "all" ? "#1f5f55" : "#334155",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              All GWs
            </button>
            <button
              type="button"
              onClick={() => setAdjustScope("gw")}
              style={{
                padding: "5px 10px",
                fontSize: 12,
                border: "none",
                borderLeft: "1px solid #cbd5e1",
                background: adjustScope === "gw" ? "rgba(61,120,108,0.16)" : "#f8fafc",
                color: adjustScope === "gw" ? "#1f5f55" : "#334155",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Selected GW
            </button>
          </div>

          {adjustScope === "gw" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>GW</span>
              <select
                value={selectedGW ?? ""}
                onChange={(e) => setSelectedGW(Number(e.target.value))}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  background: "#f8fafc",
                  color: "#1e293b",
                  fontSize: 12,
                  padding: "4px 8px",
                  outline: "none",
                }}
              >
                {tableData.gws.map((gw) => (
                  <option key={gw} value={gw}>
                    GW {gw}
                  </option>
                ))}
              </select>
            </div>
          )}

          <span style={{ fontSize: 12, color: "#64748b", flex: 1, minWidth: 240 }}>
            {adjustScope === "all"
              ? "Drag any team to update full-horizon strength (current behavior)."
              : Number.isFinite(Number(selectedGW))
              ? `Active target: GW ${selectedGW}. Drag any team in scatter to adjust only this GW.`
              : "Select a GW above, then drag a team in scatter."}
          </span>
        </section>
      )}

      <section style={{ marginTop: "0.5rem", marginBottom: "1.75rem" }}>
        <TeamScatterPlot teamPoints={teamPoints} onTeamDrag={handleTeamDrag} />
      </section>

      <section>
        <h2 style={{ marginBottom: "0.75rem", fontSize: "1rem", fontWeight: 600 }}>
          Fixture Table (XG &amp; CS per GW)
        </h2>
        <FixturesTable
          tableData={tableData}
          selectedGW={adjustScope === "gw" ? selectedGW : null}
        />
      </section>
    </div>
  );
}

/* ========== recompute XG & CS (also lock in baseline once) ========== */

function recomputeMetrics(rows) {
  return rows.map((r) => {
    const ownXG = Number(r.own_XG_avg ?? 0);
    const ownXGC = Number(r.own_XGC_avg ?? 0);
    const oppXG = Number(r.opponent_XG_avg ?? 0);
    const oppXGC = Number(r.opponent_XGC_avg ?? 0);
    const ownAttE = Number(r.own_H_Att_E ?? 0) * 0.6;
    const oppDefE = Number(r.opponent_H_def_E ?? 0) * 0.6;
    const ownDEFE = Number(r.own_H_def_E ?? 0) * 0.6;
    const oppATTE = Number(r.opponent_H_Att_E ?? 0) * 0.6;

    const base_own_XG_avg = r.base_own_XG_avg != null ? r.base_own_XG_avg : ownXG;
    const base_own_XGC_avg = r.base_own_XGC_avg != null ? r.base_own_XGC_avg : ownXGC;

    let xg;
    if (r.Home === "H") {
      const A = ownXG + ownAttE;
      const B = oppXGC - oppDefE;
      xg = Math.exp( (-1.8166 + 0.7939 * A + 0.8837 * B - 0.1104 * A * B));
    } else {
      const A = ownXG - ownAttE;
      const B = oppXGC + oppDefE;
      xg = Math.exp((-1.8166 + 0.7939 * A + 0.8837 * B - 0.1104 * A * B));
    }
    let csProb;

    if (r.Home === "H") {
      const A = ownXGC + ownDEFE;
      const B = oppXG - oppATTE;
      const alpha = 0.00000009;

      const eta =
        -1.8166 +
        0.7939 * A +
        0.8837 * B +
        -0.1104 * A * B;

      const mu = Math.exp(eta);

      csProb = alpha < 1e-6 ? Math.exp(-mu) : Math.pow(1 / (1 + alpha * mu), 1 / alpha);
    } else {
      const A = ownXGC - ownDEFE;
      const B = oppXG + oppATTE;
      const alpha = 0.00000009;

      const eta =
        -1.8166 +
        0.7939 * A +
        0.8837 * B +
        -0.1104 * A * B;

      const mu = Math.exp(eta);

      csProb = alpha < 1e-6 ? Math.exp(-mu) : Math.pow(1 / (1 + alpha * mu), 1 / alpha);
    }

    return {
      ...r,
      base_own_XG_avg,
      base_own_XGC_avg,
      XG: xg,
      CS: csProb,
    };
  });
}

/* ========== Scatter plot with draggable logo dots + arrows ========== */

function TeamScatterPlot({ teamPoints, onTeamDrag }) {
  const minX = 0.6;
  const maxX = 2.2;
  const minY = 0.6;
  const maxY = 2.2;

  const isSmall = useMediaQuery("(max-width: 640px)");

  // Taller on small screens so it doesn't feel squashed
  const chartHeight = isSmall ? 520 : 400;

  return (
    <div
      style={{
        width: "100%",
        height: chartHeight,
        background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(236,253,245,0.85))",
        borderRadius: 12,
        padding: isSmall ? "10px 6px 10px 0" : "8px 4px 8px 0",
        border: `1px solid ${PALETTE.gold}`,
        boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
        touchAction: "none",
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="own_XG_avg"
            name="Offensive"
            domain={[minX, maxX]}
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={{ stroke: "#666" }}
            tickLine={{ stroke: "#666" }}
            label={{
              value: "Offensive",
              position: "insideBottom",
              offset: -5,
              fill: "#64748b",
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="own_XGC_avg"
            name="Defensive"
            domain={[minY, maxY]}
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={{ stroke: "#666" }}
            tickLine={{ stroke: "#666" }}
            label={{
              value: "Defensive",
              angle: -90,
              position: "insideLeft",
              fill: "#64748b",
              fontSize: 11,
            }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "#555" }}
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div
                  style={{
                    background: "#ffffff",
                    color: PALETTE.beige,
                    padding: "6px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    border: `1px solid ${PALETTE.gold}`,
                    boxShadow: "0 10px 20px rgba(15,23,42,0.12)",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{p.team_name}</div>
                  <div>Offensive: {p.own_XG_avg.toFixed(2)}</div>
                  <div>Defensive: {p.own_XGC_avg.toFixed(2)}</div>
                </div>
              );
            }}
          />
          <Scatter
            data={teamPoints}
            shape={(props) => (
              <DraggableDot
                {...props}
                bounds={{ minX, maxX, minY, maxY }}
                onTeamDrag={onTeamDrag}
                // optional: pass size boost on mobile
                mobileBoost={isSmall}
              />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function DraggableDot({ cx = 0, cy = 0, payload, xAxis, yAxis, bounds, onTeamDrag }) {
  const nodeRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [dragPx, setDragPx] = useState(null);
  const [dragPy, setDragPy] = useState(null);
  const pointerIdRef = useRef(null);

  const SNAP_X = 0.05;
  const SNAP_Y = 0.05;

  const logoUrl = payload?.logo;
  const size = 26;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const snap = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

  const xRange = xAxis?.scale?.range?.() ?? [0, 0];
  const yRange = yAxis?.scale?.range?.() ?? [0, 0];

  const xMinPx = Math.min(xRange[0], xRange[1]);
  const xMaxPx = Math.max(xRange[0], xRange[1]);
  const yMinPx = Math.min(yRange[0], yRange[1]);
  const yMaxPx = Math.max(yRange[0], yRange[1]);

  const svgPointFromClient = (clientX, clientY) => {
    const svg = nodeRef.current?.ownerSVGElement;
    if (!svg) return null;

    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;

    const ctm = svg.getScreenCTM();
    if (!ctm) return null;

    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };

  const pixelToData = (px, py) => {
    const xScale = xAxis?.scale;
    const yScale = yAxis?.scale;
    if (!xScale?.invert || !yScale?.invert) return null;

    const clampedPx = clamp(px, xMinPx, xMaxPx);
    const clampedPy = clamp(py, yMinPx, yMaxPx);

    let xVal = xScale.invert(clampedPx);
    let yVal = yScale.invert(clampedPy);

    xVal = clamp(xVal, bounds.minX, bounds.maxX);
    yVal = clamp(yVal, bounds.minY, bounds.maxY);

    xVal = snap(xVal, SNAP_X);
    yVal = snap(yVal, SNAP_Y);

    xVal = clamp(xVal, bounds.minX, bounds.maxX);
    yVal = clamp(yVal, bounds.minY, bounds.maxY);

    return { xVal, yVal };
  };

  const dataToPixel = (xVal, yVal) => {
    const xScale = xAxis?.scale;
    const yScale = yAxis?.scale;
    if (!xScale || !yScale) return null;
    return { px: xScale(xVal), py: yScale(yVal) };
  };

  const arrowLine = useMemo(() => {
    const origX = payload?.orig_XG_avg;
    const origY = payload?.orig_XGC_avg;
    if (origX == null || origY == null) return null;

    const currX = payload?.own_XG_avg;
    const currY = payload?.own_XGC_avg;

    const currPixel =
      dragging && dragPx != null && dragPy != null ? { px: dragPx, py: dragPy } : dataToPixel(currX, currY);

    const origPixel = dataToPixel(origX, origY);

    if (!currPixel || !origPixel) return null;

    const dx = origPixel.px - currPixel.px;
    const dy = origPixel.py - currPixel.py;

    return { x1: dx, y1: dy, x2: 0, y2: 0 };
  }, [payload, xAxis, yAxis, dragging, dragPx, dragPy]);

  const live = useMemo(() => {
    if (!dragging || dragPx == null || dragPy == null) return null;

    const d = pixelToData(dragPx, dragPy);
    if (!d) return null;

    const snappedPix = dataToPixel(d.xVal, d.yVal);
    if (!snappedPix) return null;

    return { xVal: d.xVal, yVal: d.yVal, px: snappedPix.px, py: snappedPix.py };
  }, [dragging, dragPx, dragPy, xAxis, yAxis]);

  const onPointerDown = (e) => {
    if (!payload) return;

    pointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    setDragging(true);

    const p = svgPointFromClient(e.clientX, e.clientY);
    if (!p) return;

    setDragPx(clamp(p.x, xMinPx, xMaxPx));
    setDragPy(clamp(p.y, yMinPx, yMaxPx));
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;

    const p = svgPointFromClient(e.clientX, e.clientY);
    if (!p) return;

    setDragPx(clamp(p.x, xMinPx, xMaxPx));
    setDragPy(clamp(p.y, yMinPx, yMaxPx));
  };

  const finishDrag = () => {
    if (!dragging) return;

    if (dragPx != null && dragPy != null) {
      const d = pixelToData(dragPx, dragPy);
      if (d) onTeamDrag(payload.team_name, d.xVal, d.yVal);
    }

    setDragging(false);
    setDragPx(null);
    setDragPy(null);
    pointerIdRef.current = null;
  };

  const onPointerUp = (e) => {
    if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
    finishDrag();
  };

  const onPointerCancel = (e) => {
    if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
    finishDrag();
  };

  const renderCx = dragging && live ? live.px : cx;
  const renderCy = dragging && live ? live.py : cy;

  const crosshair =
    dragging && live
      ? { x: live.px, y: live.py, x1: xMinPx, x2: xMaxPx, y1: yMinPx, y2: yMaxPx }
      : null;

  return (
    <g transform={`translate(${renderCx}, ${renderCy})`} ref={nodeRef}>
      {crosshair && (
        <g style={{ pointerEvents: "none" }}>
          <line x1={crosshair.x1 - crosshair.x} y1={0} x2={crosshair.x2 - crosshair.x} y2={0} stroke="#666" strokeDasharray="4 4" strokeWidth={1} />
          <line x1={0} y1={crosshair.y1 - crosshair.y} x2={0} y2={crosshair.y2 - crosshair.y} stroke="#666" strokeDasharray="4 4" strokeWidth={1} />
          <circle r={3.5} fill={PALETTE.gold} />
          <g transform="translate(14,-14)">
            <rect x={0} y={-18} rx={6} ry={6} width={150} height={34} fill="#ffffff" stroke={PALETTE.gold} strokeWidth={1} opacity={0.95} />
            <text x={8} y={-4} fontSize={11} fill={PALETTE.beige}>
              Off: {live.xVal.toFixed(2)} | Def: {live.yVal.toFixed(2)}
            </text>
          </g>
        </g>
      )}

      {arrowLine && <line x1={arrowLine.x1} y1={arrowLine.y1} x2={arrowLine.x2} y2={arrowLine.y2} stroke="#888" strokeWidth={1} strokeDasharray="3 3" style={{ pointerEvents: "none" }} />}

      <g onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}>
        <circle r={size / 2 + 2} fill={PALETTE.black} stroke={PALETTE.gold} strokeWidth={2} />

        {logoUrl ? (
          <image href={logoUrl} x={-size / 2} y={-size / 2} width={size} height={size} preserveAspectRatio="xMidYMid slice" clipPath="circle(50%)" />
        ) : (
          <text x={0} y={4} textAnchor="middle" fontSize={8} fill={PALETTE.beige}>
            {payload?.team_name?.slice(0, 3) ?? ""}
          </text>
        )}
      </g>
    </g>
  );
}

/* ========== Fixture table (UPDATED: horizon slider + sticky opaque columns) ========== */

function FixturesTable({ tableData, selectedGW = null }) {
  const { gws, teams, cellMap } = tableData;

  // ---------- FIXED column widths (must match sticky offsets) ----------
  const COL_TEAM = 240;

  // ✅ horizon slider (number of GW columns to show from earliest)
  const [gwHorizon, setGwHorizon] = useState(() => Math.min(5, gws.length || 1));

  useEffect(() => {
    setGwHorizon((h) => Math.min(Math.max(1, h), gws.length || 1));
  }, [gws.length]);

  const visibleGWs = useMemo(() => gws.slice(0, gwHorizon), [gws, gwHorizon]);

  const [sortConfig, setSortConfig] = useState({
    key: "default", // 'default' | 'totalXG' | 'totalCS' | 'gwXG'
    dir: "desc",
    gw: null,
  });

  const key = (team, gw) => `${team}__${gw}`;

  const formatCS = (val) =>
    Number.isFinite(val) ? `${(val * 100).toFixed(1)}%` : "-";
  const formatXG = (val) =>
    Number.isFinite(val) ? val.toFixed(2) : "-";
  const toNumber = (v) => Number(v);
  const isSelectedGW = (gw) =>
    Number.isFinite(toNumber(selectedGW)) && toNumber(selectedGW) === toNumber(gw);

  // ✅ totals based ONLY on the selected horizon
  const totalsByTeamVisible = useMemo(() => {
    const out = {};
    for (const team of teams) {
      let totalXG = 0;
      let sumExpectedCS = 0;
      let gwCount = 0;

      for (const gw of visibleGWs) {
        const c = cellMap.get(key(team, gw));
        if (!c) continue;
        totalXG += c.expectedXG;
        sumExpectedCS += c.expectedCS;
        gwCount += 1;
      }

      out[team] = {
        totalXG,
        avgCS: gwCount ? sumExpectedCS / gwCount : 0,
      };
    }
    return out;
  }, [teams, visibleGWs, cellMap]);

  const toggleSort = (newKey, gw = null) => {
    setSortConfig((prev) => {
      if (prev.key === newKey && prev.gw === gw) {
        return { ...prev, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return { key: newKey, dir: "desc", gw };
    });
  };

  const headerArrow = (keyName, gw = null) => {
    if (sortConfig.key !== keyName || sortConfig.gw !== gw) return "";
    return sortConfig.dir === "desc" ? "▼" : "▲";
  };

  const sortedTeams = useMemo(() => {
    const arr = [...teams];
    if (sortConfig.key === "default") return arr;

    const getValue = (team) => {
      const totals = totalsByTeamVisible[team] || { totalXG: 0, avgCS: 0 };

      if (sortConfig.key === "totalXG") return totals.totalXG;
      if (sortConfig.key === "totalCS") return totals.avgCS;

      if (sortConfig.key === "gwXG" && sortConfig.gw != null) {
        const cell = cellMap.get(key(team, sortConfig.gw));
        return cell ? cell.expectedXG : 0;
      }

      return 0;
    };

    arr.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      return sortConfig.dir === "desc" ? vb - va : va - vb;
    });

    return arr;
  }, [teams, totalsByTeamVisible, sortConfig, cellMap]);

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid #d5dee9",
        overflowX: "auto",
        background: "#ffffff",
        boxShadow: "0 12px 24px rgba(15,23,42,0.08)",
      }}
    >
      {/* Sort buttons + horizon slider */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          borderBottom: "1px solid #d5dee9",
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.9))",
        }}
      >
        <span style={{ fontSize: 12, color: "#64748b" }}>Sort teams by:</span>

        <button
          onClick={() => setSortConfig({ key: "default", dir: "desc", gw: null })}
          style={sortButtonStyle(sortConfig.key === "default")}
        >
          Default
        </button>
        <button
          onClick={() => toggleSort("totalXG", null)}
          style={sortButtonStyle(sortConfig.key === "totalXG")}
        >
          Total Goals (horizon)
        </button>
        <button
          onClick={() => toggleSort("totalCS", null)}
          style={sortButtonStyle(sortConfig.key === "totalCS")}
        >
          Avg CS (horizon)
        </button>

        {/* GW horizon slider */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
            GW horizon: <b style={{ color: PALETTE.beige }}>{gwHorizon}</b>
          </span>

          <input
            type="range"
            min={1}
            max={Math.max(1, gws.length)}
            step={1}
            value={gwHorizon}
            onChange={(e) => setGwHorizon(Number(e.target.value))}
            style={{ width: 180 }}
          />

          <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
            / {gws.length}
          </span>
        </div>
      </div>

      <table
        style={{
          borderCollapse: "collapse",
          minWidth: "100%",
          fontSize: 13,
          color: PALETTE.beige,
          tableLayout: "fixed", // ✅ makes fixed widths reliable
        }}
      >
        {/* ✅ stable widths so sticky offsets align exactly */}
        <colgroup>
          <col style={{ width: COL_TEAM }} />
          {visibleGWs.map((gw) => (
            <col key={`col_${gw}`} style={{ width: 140 }} />
          ))}
          <col style={{ width: 170 }} />
        </colgroup>

        <thead>
          <tr>


            <th
              style={{
                position: "sticky",
                left: 0,
                zIndex: 10,
                width: COL_TEAM,
                background: "#ffffff",
                backgroundClip: "padding-box",
                borderBottom: "1px solid #d5dee9",
                padding: "8px 10px",
                textAlign: "left",
                fontWeight: 700,
                fontSize: 12,
                boxShadow: "2px 0 0 rgba(148,163,184,0.2)", // ✅ hard edge after sticky cols
              }}
            >
              Team
            </th>

            {visibleGWs.map((gw) => (
              <th
                key={gw}
                onClick={() => toggleSort("gwXG", gw)}
                style={{
                  borderBottom: "1px solid #d5dee9",
                  padding: "8px 10px",
                  textAlign: "center",
                  backgroundColor: isSelectedGW(gw) ? "#eff6ff" : "#ffffff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  userSelect: "none",
                  color:
                    sortConfig.key === "gwXG" && sortConfig.gw === gw
                      ? "#1f5f55"
                      : PALETTE.beige,
                }}
              >
                GW {gw} {headerArrow("gwXG", gw)}
              </th>
            ))}

            <th
              onClick={() => toggleSort("totalXG", null)}
              style={{
                borderBottom: "1px solid #d5dee9",
                padding: "8px 10px",
                textAlign: "center",
                backgroundColor: "#ffffff",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                userSelect: "none",
                color: sortConfig.key === "totalXG" ? "#1f5f55" : PALETTE.beige,
              }}
            >
              Total (horizon) {headerArrow("totalXG", null)}
            </th>
          </tr>
        </thead>

        <tbody>
          {sortedTeams.map((team, rowIdx) => {
            const totals = totalsByTeamVisible[team] || { totalXG: 0, avgCS: 0 };
            const rowBg = rowIdx % 2 === 0 ? "#ffffff" : "#fbfdff";
            const logoUrl = teamLogos[team];

            return (
              <tr key={team} style={{ backgroundColor: rowBg }}>


                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 9,
                    width: COL_TEAM,
                    borderBottom: "1px solid #e2e8f0",
                    padding: "6px 10px",
                    background: rowBg, // ✅ opaque
                    backgroundClip: "padding-box",
                    boxShadow: "2px 0 0 rgba(148,163,184,0.2)", // ✅ no bleed edge
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={`${team} logo`}
                        style={{
                          height: 24,
                          width: 24,
                          borderRadius: "999px",
                          objectFit: "contain",
                          backgroundColor: "#ffffff",
                          border: "1px solid #c7d8d2",
                          flex: "0 0 auto",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          height: 24,
                          width: 24,
                          borderRadius: "999px",
                          background: "#27272a",
                          border: "1px solid #c7d8d2",
                          flex: "0 0 auto",
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {team}
                    </span>
                  </div>
                </td>

                {visibleGWs.map((gw) => {
                  const cell = cellMap.get(key(team, gw));
                  if (!cell) {
                    return (
                      <td
                        key={gw}
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          padding: "6px 10px",
                          textAlign: "center",
                          color: "#6b7280",
                        }}
                      >
                        –
                      </td>
                    );
                  }

                  const xgVal = cell.expectedXG;
                  const csVal = cell.expectedCS;

                  const oppSummary = (cell.opps || [])
                    .slice()
                    .sort((a, b) => b.p - a.p)
                    .slice(0, 3)
                    .map((e) => `${e.opp} (${Math.round(e.p * 100)}%) ${e.hav}`)
                    .join(" • ");

                  let bg = "#f8fafc";
                  let borderColor = "#d9e2ec";
                  if (xgVal > 1.7) {
                    bg = "#edfdf4";
                    borderColor = "#bbf7d0";
                  } else if (xgVal < 1.1) {
                    bg = "#fff1f2";
                    borderColor = "#fecdd3";
                  } else {
                    bg = "#fffbeb";
                    borderColor = "#fde68a";
                  }

                  const lowScore = xgVal < 1.1;
                  const lowCS = csVal < 0.3;

                  return (
                    <td
                      key={gw}
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        padding: "6px 10px",
                        textAlign: "center",
                        backgroundColor: isSelectedGW(gw) ? "#f8fbff" : rowBg,
                      }}
                    >
                      <div
                        style={{
                          borderRadius: 10,
                          padding: "5px 7px",
                          background: bg,
                          border: isSelectedGW(gw)
                            ? "1px solid #93c5fd"
                            : `1px solid ${borderColor}`,
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          transition: "background-color 120ms ease, border-color 120ms ease",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={oppSummary}
                        >
                          {oppSummary || "—"}
                        </span>

                        <span style={{ fontSize: 11, color: lowScore ? "#b91c1c" : "#1e293b" }}>
                          Goals: {formatXG(xgVal)}
                        </span>

                        <span style={{ fontSize: 11, color: lowCS ? "#b91c1c" : "#1e293b" }}>
                          CS Odds: {formatCS(csVal)}
                        </span>
                      </div>
                    </td>
                  );
                })}

                {/* ✅ totals now based on horizon */}
                <td
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    padding: "6px 10px",
                    textAlign: "center",
                    fontWeight: 600,
                    color: "#1f5f55",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>Total Goals: {totals.totalXG.toFixed(2)}</span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      Avg Clean Sheets: {(totals.avgCS * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function sortButtonStyle(active) {
  return {
    padding: "4px 10px",
    borderRadius: 999,
    border: active ? "1px solid #9fc7bf" : "1px solid #cbd5e1",
    background: active ? "rgba(61,120,108,0.12)" : "#f8fafc",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: active ? "#1f5f55" : "#334155",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}

export default TeamAdjustmentsPage;





