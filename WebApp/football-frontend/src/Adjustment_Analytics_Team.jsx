import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useAdjustmentData } from "./Contexts/AdjustmentsContext";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Draggable from "react-draggable";
import teamLogos from "./utils/team_logos";

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  black: "#000000",
  beige: "#f7ead6",
};

const normalizeName = (s) => String(s ?? "").trim().toLowerCase();

function TeamAdjustmentsPage() {
  const { fetchIfNeeded, loading, Teamdata } = useAdjustmentData();
  const [data, setData] = useState([]);
  const [resetting, setResetting] = useState(false);

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
      // baseline fields may already be there (if context persisted them)
      base_own_XG_avg:
        r.base_own_XG_avg != null
          ? Number(r.base_own_XG_avg)
          : null,
      base_own_XGC_avg:
        r.base_own_XGC_avg != null
          ? Number(r.base_own_XGC_avg)
          : null,
    }));

    const withMetrics = recomputeMetrics(cleaned);
    setData(withMetrics);
    Teamdata.current = withMetrics; // keep context in sync
  };

  // Initial fetch
  useEffect(() => {
    (async () => {
      await fetchIfNeeded();
      if (Teamdata.current) {
        initializeFromContext(Teamdata.current);
      }
    })();
  }, [fetchIfNeeded, Teamdata]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unique team points for scatter (read baseline from data rows)
  const teamPoints = useMemo(() => {
    const byTeam = new Map();

    for (const r of data) {
      if (!byTeam.has(r.team_name)) {
        // Use per-row baseline if present, else first observed value
        const origX =
          r.base_own_XG_avg != null
            ? r.base_own_XG_avg
            : r.own_XG_avg;
        const origY =
          r.base_own_XGC_avg != null
            ? r.base_own_XGC_avg
            : r.own_XGC_avg;

        byTeam.set(r.team_name, {
          team_name: r.team_name,
          own_XG_avg: r.own_XG_avg,
          own_XGC_avg: r.own_XGC_avg,
          orig_XG_avg: origX,
          orig_XGC_avg: origY,
          logo: teamLogos[r.team_name] || null,
        });
      }
    }
    return Array.from(byTeam.values());
  }, [data]);

  // Table data: gws, teams, rowMap, totals per team
  const tableData = useMemo(() => {
    const gws = Array.from(new Set(data.map((r) => r.GW))).sort(
      (a, b) => Number(a) - Number(b)
    );
    const teams = Array.from(
      new Set(data.map((r) => r.team_name))
    ).sort();

    const key = (team, gw) => `${team}__${gw}`;
    const rowMap = new Map();
    for (const r of data) {
      rowMap.set(key(r.team_name, r.GW), r);
    }

    const totalsByTeam = {};
    for (const team of teams) {
      let totalXG = 0;
      let csSum = 0;
      let count = 0;
      for (const gw of gws) {
        const row = rowMap.get(key(team, gw));
        if (!row) continue;
        const xg = Number.isFinite(row.XG) ? row.XG : 0;
        const cs = Number.isFinite(row.CS) ? row.CS : 0;
        totalXG += xg;
        csSum += cs;
        count += 1;
      }
      const avgCS = count > 0 ? csSum / count : 0;
      totalsByTeam[team] = { totalXG, avgCS };
    }

    return { gws, teams, rowMap, totalsByTeam };
  }, [data]);

  // When user drags a team in the scatter
  const handleTeamDrag = (teamName, newXg, newXgc) => {
    setData((prev) => {
      const target = normalizeName(teamName);

      const updated = prev.map((r) => {
        const clone = { ...r };
        const ownName = normalizeName(clone.team_name);
        const oppName = normalizeName(clone.opponent_team);

        // Keep baseline fields untouched (they store original API strengths)
        const base_own_XG_avg =
          clone.base_own_XG_avg != null
            ? clone.base_own_XG_avg
            : clone.own_XG_avg;
        const base_own_XGC_avg =
          clone.base_own_XGC_avg != null
            ? clone.base_own_XGC_avg
            : clone.own_XGC_avg;

        if (ownName === target) {
          clone.own_XG_avg = newXg;
          clone.own_XGC_avg = newXgc;
        }

        if (oppName === target) {
          clone.opponent_XG_avg = newXg;
          clone.opponent_XGC_avg = newXgc;
        }

        return {
          ...clone,
          base_own_XG_avg,
          base_own_XGC_avg,
        };
      });

      // Recompute XG & CS for ALL rows (both sides affected)
      const withMetrics = recomputeMetrics(updated);
      Teamdata.current = withMetrics; // also update context with new XG & CS
      return withMetrics;
    });
  };

  // Reset button: refetch and reset
  const handleReset = async () => {
    try {
      setResetting(true);
      Teamdata.current = null; // so fetchIfNeeded actually refetches
      await fetchIfNeeded();
      if (Teamdata.current) {
        initializeFromContext(Teamdata.current);
      }
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
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #000000 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
            <h1
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: 700,
              }}
            >
              Team Adjustment Tool
            </h1>
            <p
              style={{
                marginTop: "0.25rem",
                fontSize: "0.85rem",
                color: "#d1c3a9",
                maxWidth: "640px",
              }}
            >
              Drag a team in the scatter plot to adjust its{" "}
              <b>Offensive</b> and <b>Defensive</b> strength. All
              fixtures update automatically for that
              team and its opponents.
            </p>
          </div>
          <button
            onClick={handleReset}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "999px",
              border: `1px solid ${PALETTE.gold}`,
              background:
                "linear-gradient(135deg, rgba(0,0,0,0.9), rgba(90,0,0,0.95))",
              color: PALETTE.beige,
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 500,
              boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
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

      <section
        style={{
          marginTop: "0.5rem",
          marginBottom: "1.75rem",
        }}
      >
        <TeamScatterPlot
          teamPoints={teamPoints}
          onTeamDrag={handleTeamDrag}
        />
      </section>

      <section>
        <h2
          style={{
            marginBottom: "0.75rem",
            fontSize: "1rem",
            fontWeight: 600,
          }}
        >
          Fixture Table (XG &amp; CS per GW)
        </h2>
        <FixturesTable tableData={tableData} />
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
    const ownAttE = Number(r.own_H_Att_E ?? 0);
    const oppDefE = Number(r.opponent_H_def_E ?? 0);

    // Baseline: keep the very first strengths as base_* (if not already set)
    const base_own_XG_avg =
      r.base_own_XG_avg != null ? r.base_own_XG_avg : ownXG;
    const base_own_XGC_avg =
      r.base_own_XGC_avg != null ? r.base_own_XGC_avg : ownXGC;

    // XG formula (home/away adjustments)
    let xg;
    if (r.Home === "H") {
      xg =
        (ownXG + ownAttE) * 0.25 +
        0.25 * (oppXGC - oppDefE) +
        (1 / 3) * (ownXG + ownAttE) * (oppXGC - oppDefE);
    } else {
      xg =
        (ownXG - ownAttE) * 0.25 +
        0.25 * (oppXGC + oppDefE) +
        (1 / 3) * (ownXG - ownAttE) * (oppXGC + oppDefE);
    }

    // CS formula: 0.4 / (0.6 * own_XGC_avg + 0.4 * opponent_XG_avg)
    const denom = 0.6 * ownXGC + 0.4 * oppXG;
    let csProb;
    if (denom <= 0) {
      csProb = 1;
    } else {
      csProb = 0.4 / denom;
    }
    csProb = Math.max(0, Math.min(1, csProb)); // clamp [0,1]

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
  // Fixed domain
  const minX = 0.6;
  const maxX = 2.5;
  const minY = 0.6;
  const maxY = 2.5;

  return (
    <div
      style={{
        width: "100%",
        height: 400,
        background:
          "linear-gradient(145deg, rgba(0,0,0,0.98), rgba(90,0,0,0.85))",
        borderRadius: 12,
        padding: "8px 4px 8px 0",
        border: `1px solid ${PALETTE.gold}`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.9)",
      }}
    >
      <ResponsiveContainer>
        <ScatterChart
          margin={{ top: 10, right: 20, bottom: 30, left: 30 }}
        >
          <CartesianGrid stroke="#333" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="own_XG_avg"
            name="Offensive"
            domain={[minX, maxX]}
            tick={{ fill: PALETTE.beige, fontSize: 10 }}
            axisLine={{ stroke: "#666" }}
            tickLine={{ stroke: "#666" }}
            label={{
              value: "Offensive",
              position: "insideBottom",
              offset: -5,
              fill: PALETTE.beige,
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="own_XGC_avg"
            name="Defensive"
            domain={[minY, maxY]}
            tick={{ fill: PALETTE.beige, fontSize: 10 }}
            axisLine={{ stroke: "#666" }}
            tickLine={{ stroke: "#666" }}
            label={{
              value: "Defensive",
              angle: -90,
              position: "insideLeft",
              fill: PALETTE.beige,
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
                    background: "#111",
                    color: PALETTE.beige,
                    padding: "6px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    border: `1px solid ${PALETTE.gold}`,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.9)",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {p.team_name}
                  </div>
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
              />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
function DraggableDot({
  cx = 0,
  cy = 0,
  payload,
  onTeamDrag,
  bounds,
}) {
  const [pos, setPos] = useState({ x: cx, y: cy });
  const nodeRef = useRef(null);

  // keep Draggable in sync when Recharts repositions the point
  useEffect(() => {
    setPos({ x: cx, y: cy });
  }, [cx, cy]);

  const handleStop = (e, d) => {
    if (!payload || !nodeRef.current) return;

    const dx = d.x - cx;
    const dy = d.y - cy;

    // Find the surrounding <svg> to get real pixel size
    const svg = nodeRef.current.closest("svg");
    const rect = svg?.getBoundingClientRect();

    // Fallback values if something weird happens
    const plotWidth = rect?.width || 600;
    const plotHeight = rect?.height || 400;

    const spanX = bounds.maxX - bounds.minX || 1;
    const spanY = bounds.maxY - bounds.minY || 1;

    // Dampen a bit for smoother “feel”
    const damping = 0.9;

    const deltaDataX = damping * (dx / plotWidth) * spanX;
    const deltaDataY = -damping * (dy / plotHeight) * spanY; // invert Y

    let newXg = payload.own_XG_avg + deltaDataX;
    let newXgc = payload.own_XGC_avg + deltaDataY;

    // Clamp to chart domain
    newXg = Math.max(bounds.minX, Math.min(bounds.maxX, newXg));
    newXgc = Math.max(bounds.minY, Math.min(bounds.maxY, newXgc));

    onTeamDrag(payload.team_name, newXg, newXgc);
  };

  // Arrow from baseline (orig) to current (payload values) in *local* space
  const arrowLine = (() => {
    const origX = payload?.orig_XG_avg;
    const origY = payload?.orig_XGC_avg;
    if (origX == null || origY == null) return null;

    const svg = nodeRef.current?.closest("svg");
    const rect = svg?.getBoundingClientRect();
    const plotWidth = rect?.width || 600;
    const plotHeight = rect?.height || 400;

    const spanX = bounds.maxX - bounds.minX || 1;
    const spanY = bounds.maxY - bounds.minY || 1;

    // Current data pos
    const currX = payload.own_XG_avg;
    const currY = payload.own_XGC_avg;

    const origNormX = (origX - bounds.minX) / spanX;
    const origNormY = (bounds.maxY - origY) / spanY;
    const currNormX = (currX - bounds.minX) / spanX;
    const currNormY = (bounds.maxY - currY) / spanY;

    const origScreenX = origNormX * plotWidth;
    const origScreenY = origNormY * plotHeight;
    const currScreenX = currNormX * plotWidth;
    const currScreenY = currNormY * plotHeight;

    const dx = currScreenX - origScreenX;
    const dy = currScreenY - origScreenY;

    // In local <g>, current dot is (0,0)
    const x1 = -dx;
    const y1 = -dy;
    const x2 = 0;
    const y2 = 0;

    return { x1, y1, x2, y2 };
  })();

  const logoUrl = payload?.logo;
  const size = 26;

  return (
    <Draggable
      nodeRef={nodeRef}
      position={pos}
      onDrag={(_, d) => setPos({ x: d.x, y: d.y })}
      onStop={handleStop}
    >
      <g ref={nodeRef} style={{ cursor: "pointer" }}>
        {arrowLine && (
          <line
            x1={arrowLine.x1}
            y1={arrowLine.y1}
            x2={arrowLine.x2}
            y2={arrowLine.y2}
            stroke="#888"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        <circle
          r={size / 2 + 2}
          fill={PALETTE.black}
          stroke={PALETTE.gold}
          strokeWidth={2}
        />
        {logoUrl ? (
          <image
            href={logoUrl}
            x={-size / 2}
            y={-size / 2}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid slice"
            clipPath="circle(50%)"
          />
        ) : (
          <text
            x={0}
            y={4}
            textAnchor="middle"
            fontSize={8}
            fill={PALETTE.beige}
          >
            {payload?.team_name?.slice(0, 3) ?? ""}
          </text>
        )}
        <title>
          {payload
            ? `${payload.team_name}: Off ${payload.own_XG_avg.toFixed(
                2
              )}, Def ${payload.own_XGC_avg.toFixed(2)}`
            : ""}
        </title>
      </g>
    </Draggable>
  );
}


/* ========== Fixture table (unchanged except logo use) ========== */

function FixturesTable({ tableData }) {
  const { gws, teams, rowMap, totalsByTeam } = tableData;

  const [sortConfig, setSortConfig] = useState({
    key: "default", // 'default' | 'totalXG' | 'totalCS' | 'gwXG'
    dir: "desc",
    gw: null,
  });

  const key = (team, gw) => `${team}__${gw}`;

  const sortedTeams = useMemo(() => {
    const arr = [...teams];

    if (sortConfig.key === "default") return arr;

    const getValue = (team) => {
      const totals = totalsByTeam[team] || {
        totalXG: 0,
        avgCS: 0,
      };

      if (sortConfig.key === "totalXG") return totals.totalXG;
      if (sortConfig.key === "totalCS") return totals.avgCS;

      if (sortConfig.key === "gwXG" && sortConfig.gw != null) {
        const row = rowMap.get(key(team, sortConfig.gw));
        return row && Number.isFinite(row.XG) ? row.XG : 0;
      }

      return 0;
    };

    arr.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (sortConfig.dir === "desc") {
        return vb - va;
      } else {
        return va - vb;
      }
    });

    return arr;
  }, [teams, totalsByTeam, sortConfig, rowMap]);

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

  const formatHAV = (Home) => {
    if (Home === true || Home === "Home" || Home === "H") return "H";
    if (Home === false || Home === "Away" || Home === "A") return "A";
    return "-";
  };

  const formatCS = (val) =>
    Number.isFinite(val) ? `${(val * 100).toFixed(1)}%` : "-";
  const formatXG = (val) =>
    Number.isFinite(val) ? val.toFixed(2) : "-";

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${PALETTE.gold}`,
        overflowX: "auto",
        background:
          "linear-gradient(155deg, rgba(0,0,0,0.98), rgba(0,0,0,0.9))",
        boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
      }}
    >
      {/* Sort buttons */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderBottom: `1px solid ${PALETTE.gold}`,
          background:
            "linear-gradient(145deg, rgba(0,0,0,0.95), rgba(90,0,0,0.9))",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "#d1c3a9",
          }}
        >
          Sort teams by:
        </span>
        <button
          onClick={() =>
            setSortConfig({ key: "default", dir: "desc", gw: null })
          }
          style={sortButtonStyle(sortConfig.key === "default")}
        >
          Default
        </button>
        <button
          onClick={() => toggleSort("totalXG", null)}
          style={sortButtonStyle(sortConfig.key === "totalXG")}
        >
          Total XG
        </button>
        <button
          onClick={() => toggleSort("totalCS", null)}
          style={sortButtonStyle(sortConfig.key === "totalCS")}
        >
          Avg CS
        </button>
      </div>

      <table
        style={{
          borderCollapse: "collapse",
          minWidth: "100%",
          fontSize: 13,
          color: PALETTE.beige,
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                position: "sticky",
                left: 0,
                zIndex: 3,
                backgroundColor: "#111111",
                borderBottom: `1px solid ${PALETTE.gold}`,
                padding: "8px 10px",
                textAlign: "left",
                width: 40,
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              #
            </th>
            <th
              style={{
                position: "sticky",
                left: 40,
                zIndex: 3,
                backgroundColor: "#111111",
                borderBottom: `1px solid ${PALETTE.gold}`,
                padding: "8px 10px",
                textAlign: "left",
                minWidth: 150,
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              Team
            </th>
            {gws.map((gw) => (
              <th
                key={gw}
                onClick={() => toggleSort("gwXG", gw)}
                style={{
                  borderBottom: `1px solid ${PALETTE.gold}`,
                  padding: "8px 10px",
                  textAlign: "center",
                  backgroundColor: "#111111",
                  minWidth: 120,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  userSelect: "none",
                  color:
                    sortConfig.key === "gwXG" &&
                    sortConfig.gw === gw
                      ? PALETTE.gold
                      : PALETTE.beige,
                }}
              >
                GW {gw} {headerArrow("gwXG", gw)}
              </th>
            ))}
            <th
              onClick={() => toggleSort("totalXG", null)}
              style={{
                borderBottom: `1px solid ${PALETTE.gold}`,
                padding: "8px 10px",
                textAlign: "center",
                backgroundColor: "#111111",
                minWidth: 130,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                userSelect: "none",
                color:
                  sortConfig.key === "totalXG"
                    ? PALETTE.gold
                    : PALETTE.beige,
              }}
            >
              Total {headerArrow("totalXG", null)}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team, rowIdx) => {
            const totals = totalsByTeam[team] || {
              totalXG: 0,
              avgCS: 0,
            };
            const rank = rowIdx + 1;
            const rowBg =
              rowIdx % 2 === 0 ? "#080808" : "#151515";
            const logoUrl = teamLogos[team];

            return (
              <tr key={team} style={{ backgroundColor: rowBg }}>
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    borderBottom: "1px solid #222222",
                    padding: "6px 10px",
                    fontSize: 12,
                    backgroundColor: rowBg,
                  }}
                >
                  {rank}
                </td>
                <td
                  style={{
                    position: "sticky",
                    left: 40,
                    zIndex: 2,
                    borderBottom: "1px solid #222222",
                    padding: "6px 10px",
                    backgroundColor: rowBg,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={`${team} logo`}
                        style={{
                          height: 24,
                          width: 24,
                          borderRadius: "999px",
                          objectFit: "contain",
                          backgroundColor: "#000",
                          border: `1px solid ${PALETTE.gold}`,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          height: 24,
                          width: 24,
                          borderRadius: "999px",
                          background: "#27272a",
                          border: `1px solid ${PALETTE.gold}`,
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

                {gws.map((gw) => {
                  const row = rowMap.get(key(team, gw));
                  if (!row) {
                    return (
                      <td
                        key={gw}
                        style={{
                          borderBottom: "1px solid #222222",
                          padding: "6px 10px",
                          textAlign: "center",
                          color: "#6b7280",
                        }}
                      >
                        –
                      </td>
                    );
                  }

                  const xgVal = Number.isFinite(row.XG) ? row.XG : 0;
                  const csVal = Number.isFinite(row.CS) ? row.CS : 0;
                  const oppName = row.opponent_team || "";
                  const hav = formatHAV(row.Home);

                  // Simple heat coloring based on XG (dark theme)
                  let bg = "#1f2933";
                  if (xgVal > 1.7) bg = "rgba(22,163,74,0.45)"; // green-ish
                  else if (xgVal < 1.1) bg = "rgba(220,38,38,0.45)"; // red-ish
                  else bg = "rgba(202,138,4,0.45)"; // golden

                  return (
                    <td
                      key={gw}
                      style={{
                        borderBottom: "1px solid #222222",
                        padding: "6px 10px",
                        textAlign: "center",
                        minWidth: 120,
                      }}
                    >
                      <div
                        style={{
                          borderRadius: 8,
                          padding: "4px 6px",
                          background: bg,
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
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
                          title={oppName}
                        >
                          {oppName || "TBD"}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#e5e7eb",
                          }}
                        >
                          ({hav})
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: PALETTE.beige,
                          }}
                        >
                          XG: {formatXG(xgVal)}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: PALETTE.beige,
                          }}
                        >
                          CS: {formatCS(csVal)}
                        </span>
                      </div>
                    </td>
                  );
                })}

                {/* Total column */}
                <td
                  style={{
                    borderBottom: "1px solid #222222",
                    padding: "6px 10px",
                    textAlign: "center",
                    minWidth: 130,
                    fontWeight: 600,
                    color: PALETTE.gold,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span>
                      Total XG: {totals.totalXG.toFixed(2)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#d1c3a9",
                      }}
                    >
                      Avg CS: {(totals.avgCS * 100).toFixed(1)}%
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
    border: active
      ? `1px solid ${PALETTE.gold}`
      : "1px solid #4b5563",
    background: active
      ? "rgba(184,134,11,0.2)"
      : "rgba(0,0,0,0.9)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: PALETTE.beige,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}

export default TeamAdjustmentsPage;
