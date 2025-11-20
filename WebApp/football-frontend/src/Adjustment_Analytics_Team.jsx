import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useAdjustmentData } from "./Contexts/AdjustmentsContext";
// Optional: if you have a logo map like in your other file, uncomment this:
// import teamLogos from "./utils/team_logos";
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

const normalizeName = (s) => String(s ?? "").trim().toLowerCase();

function TeamAdjustmentsPage() {
  const { fetchIfNeeded, loading, Teamdata } = useAdjustmentData();
  const [data, setData] = useState([]);
  const [resetting, setResetting] = useState(false);
  const [originalPositions, setOriginalPositions] = useState(null); // for arrows

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
    }));

    // store original positions for arrows (first time only)
    if (!originalPositions) {
      const orig = {};
      for (const r of cleaned) {
        if (!orig[r.team_name]) {
          orig[r.team_name] = {
            x: r.own_XG_avg,
            y: r.own_XGC_avg,
          };
        }
      }
      setOriginalPositions(orig);
    }

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

  // Unique team points for scatter (attach original positions)
  const teamPoints = useMemo(() => {
    const byTeam = new Map();
    for (const r of data) {
      if (!byTeam.has(r.team_name)) {
        const orig = originalPositions?.[r.team_name];
        byTeam.set(r.team_name, {
          team_name: r.team_name,
          own_XG_avg: r.own_XG_avg,
          own_XGC_avg: r.own_XGC_avg,
          orig_XG_avg: orig?.x,
          orig_XGC_avg: orig?.y,
        });
      }
    }
    return Array.from(byTeam.values());
  }, [data, originalPositions]);

  // Table data: gws, teams, rowMap, totals per team
  const tableData = useMemo(() => {
    const gws = Array.from(new Set(data.map((r) => r.GW))).sort(
      (a, b) => Number(a) - Number(b)
    );
    const teams = Array.from(new Set(data.map((r) => r.team_name))).sort();

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

        // Update as "own" team
        if (ownName === target) {
          clone.own_XG_avg = newXg;
          clone.own_XGC_avg = newXgc;
        }

        // Update wherever they are the opponent
        if (oppName === target) {
          clone.opponent_XG_avg = newXg;
          clone.opponent_XGC_avg = newXgc;
        }
        return clone;
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
        setOriginalPositions(null); // reset arrows
        initializeFromContext(Teamdata.current);
      }
    } catch (e) {
      console.error("Failed to reset:", e);
    } finally {
      setResetting(false);
    }
  };

  if ((loading && data.length === 0) || resetting) {
    return <div style={{ padding: 20 }}>Loading team data…</div>;
  }

  if (!loading && data.length === 0) {
    return <div style={{ padding: 20 }}>No data found.</div>;
  }

  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            textAlign: "center",
          }}
        >
          Team Adjustment Tool
        </h1>
        <p
          style={{
            marginTop: 8,
            fontSize: 14,
            color: "#e6e2e2ff",
            textAlign: "center",
          }}
        >
          Drag a team in the scatter plot to adjust its{" "}
          <b>Offensive </b>and <b>Defensive </b>
          strength. All fixtures (Goals &amp; CS) update automatically for that
          team and its opponents.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <button
            onClick={handleReset}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              background: "#1976d2",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            🔄 Reset data
          </button>
        </div>
      </header>

      <section style={{ marginTop: 10, marginBottom: 40 }}>
        <TeamScatterPlot
          teamPoints={teamPoints}
          onTeamDrag={handleTeamDrag}
        />
      </section>

      <section>
        <h2 style={{ marginBottom: 10 }}>Fixture Table (XG &amp; CS per GW)</h2>
        <FixturesTable tableData={tableData} />
      </section>
    </div>
  );
}

/* ========== recompute XG & CS ========== */

function recomputeMetrics(rows) {
  return rows.map((r) => {
    const ownXG = Number(r.own_XG_avg ?? 0);
    const ownXGC = Number(r.own_XGC_avg ?? 0);
    const oppXG = Number(r.opponent_XG_avg ?? 0);
    const oppXGC = Number(r.opponent_XGC_avg ?? 0);
    const ownAttE = Number(r.own_H_Att_E ?? 0);
    const oppDefE = Number(r.opponent_H_def_E ?? 0);

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
      XG: xg,
      CS: csProb,
    };
  });
}

/* ========== Scatter plot with draggable dots + arrows ========== */

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
        background: "#111",
        borderRadius: 8,
        padding: "8px 4px 8px 0",
      }}
    >
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid stroke="#444" />
          <XAxis
            type="number"
            dataKey="own_XG_avg"
            name="Offensive"
            domain={[minX, maxX]}
            tick={false}
            axisLine={{ stroke: "#888" }}
            label={{
              value: "Offensive",
              position: "insideBottom",
              offset: -5,
              fill: "#fff",
            }}
          />
          <YAxis
            type="number"
            dataKey="own_XGC_avg"
            name="Defensive"
            domain={[minY, maxY]}
            tick={false}
            axisLine={{ stroke: "#888" }}
            label={{
              value: "Defensive",
              angle: -90,
              position: "insideLeft",
              fill: "#fff",
            }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div
                  style={{
                    background: "#222",
                    color: "#fff",
                    padding: "6px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    border: "1px solid #555",
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
              />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function DraggableDot({ cx = 0, cy = 0, payload, onTeamDrag, bounds }) {
  const [pos, setPos] = useState({ x: cx, y: cy });
  const nodeRef = useRef(null);

  useEffect(() => {
    setPos({ x: cx, y: cy });
  }, [cx, cy]);

  const handleStop = (e, d) => {
    if (!payload) return;

    const dx = d.x - cx;
    const dy = d.y - cy;

    // Less sensitive mapping from pixels to data units
    const approxWidth = 1100;
    const approxHeight = 700;
    const spanX = bounds.maxX - bounds.minX || 1;
    const spanY = bounds.maxY - bounds.minY || 1;

    const sensitivity = 1; // tweak if needed
    const deltaDataX = sensitivity * (dx / approxWidth) * spanX;
    // Invert Y so dragging up increases defensive value
    const deltaDataY = -sensitivity * (dy / approxHeight) * spanY;

    const newXg = payload.own_XG_avg + deltaDataX;
    const newXgc = payload.own_XGC_avg + deltaDataY;

    onTeamDrag(payload.team_name, newXg, newXgc);
  };

  // Draw approximate arrow from original to current in local <g> coords
  const arrowLine = (() => {
    const origX = payload?.orig_XG_avg;
    const origY = payload?.orig_XGC_avg;
    if (origX == null || origY == null) return null;

    const approxWidth = 1100;
    const approxHeight = 700;
    const spanX = bounds.maxX - bounds.minX || 1;
    const spanY = bounds.maxY - bounds.minY || 1;

    // original in [0,1] screen space
    const origNormX = (origX - bounds.minX) / spanX;
    const origNormY = (bounds.maxY - origY) / spanY;
    const currNormX = (payload.own_XG_avg - bounds.minX) / spanX;
    const currNormY = (bounds.maxY - payload.own_XGC_avg) / spanY;

    const origScreenX = origNormX * approxWidth;
    const origScreenY = origNormY * approxHeight;
    const currScreenX = currNormX * approxWidth;
    const currScreenY = currNormY * approxHeight;

    const dx = currScreenX - origScreenX;
    const dy = currScreenY - origScreenY;

    // In the local group, the current dot is at (0,0)
    const x1 = -dx;
    const y1 = -dy;
    const x2 = 0;
    const y2 = 0;

    return { x1, y1, x2, y2 };
  })();

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
        <circle r={6} fill="#4caf50" stroke="#fff" strokeWidth={1} />
        {payload && (
          <>
            <text
              x={10}
              y={-10}
              fontSize={10}
              fill="#fff"
              style={{ pointerEvents: "none" }}
            >
              {payload.team_name}
            </text>
            <title>
              {`${payload.team_name}: Off ${payload.own_XG_avg.toFixed(
                2
              )}, Def ${payload.own_XGC_avg.toFixed(2)}`}
            </title>
          </>
        )}
      </g>
    </Draggable>
  );
}

/* ========== Fixture table (styled like your example, with sorting) ========== */

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
      const totals = totalsByTeam[team] || { totalXG: 0, avgCS: 0 };

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
    return sortConfig.dir === "desc" ? " ↓" : " ↑";
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
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
        overflowX: "auto",
        background: "#f9fafb",
      }}
    >
      {/* Sort buttons (prettier) */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          background: "#fff",
        }}
      >
        <span style={{ fontSize: 12, color: "#555" }}>Sort teams by:</span>
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
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                position: "sticky",
                left: 0,
                zIndex: 3,
                background: "#f3f4f6",
                borderBottom: "1px solid #e5e7eb",
                padding: "8px 10px",
                textAlign: "left",
                width: 40,
                fontWeight: 700,
                fontSize: 12,
                color: "#111827",
              }}
            >
              #
            </th>
            <th
              style={{
                position: "sticky",
                left: 40,
                zIndex: 3,
                background: "#f3f4f6",
                borderBottom: "1px solid #e5e7eb",
                padding: "8px 10px",
                textAlign: "left",
                minWidth: 150,
                fontWeight: 700,
                fontSize: 12,
                color: "#111827",
              }}
            >
              Team
            </th>
            {gws.map((gw) => (
              <th
                key={gw}
                onClick={() => toggleSort("gwXG", gw)}
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  padding: "8px 10px",
                  textAlign: "center",
                  background: "#f3f4f6",
                  minWidth: 120,
                  fontWeight: 700,
                  fontSize: 12,
                  color: "#111827",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                GW {gw}
                {headerArrow("gwXG", gw)}
              </th>
            ))}
            <th
              onClick={() => toggleSort("totalXG", null)}
              style={{
                borderBottom: "1px solid #e5e7eb",
                padding: "8px 10px",
                textAlign: "center",
                background: "#f3f4f6",
                minWidth: 130,
                fontWeight: 700,
                fontSize: 12,
                color: "#111827",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              Total
              {headerArrow("totalXG", null)}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team, rowIdx) => {
            const totals = totalsByTeam[team] || { totalXG: 0, avgCS: 0 };
            const rank = rowIdx + 1;

            return (
              <tr
                key={team}
                style={{
                  backgroundColor: rowIdx % 2 === 0 ? "#ffffff" : "#f9fafb",
                }}
              >
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    borderBottom: "1px solid #e5e7eb",
                    padding: "6px 10px",
                    fontSize: 12,
                    color: "#374151",
                    backgroundColor:
                      rowIdx % 2 === 0 ? "#ffffff" : "#f9fafb",
                  }}
                >
                  {rank}
                </td>
                <td
                  style={{
                    position: "sticky",
                    left: 40,
                    zIndex: 2,
                    borderBottom: "1px solid #e5e7eb",
                    padding: "6px 10px",
                    backgroundColor:
                      rowIdx % 2 === 0 ? "#ffffff" : "#f9fafb",
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
                    {/* If you have logos, uncomment this and import teamLogos:
                    {teamLogos?.[team] ? (
                      <img
                        src={teamLogos[team]}
                        alt={`${team} logo`}
                        style={{ height: 22, width: 22, objectFit: "contain" }}
                      />
                    ) : (
                      <div
                        style={{
                          height: 22,
                          width: 22,
                          borderRadius: "999px",
                          background: "#e5e7eb",
                        }}
                      />
                    )}
                    */}
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#111827",
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
                          borderBottom: "1px solid #e5e7eb",
                          padding: "6px 10px",
                          textAlign: "center",
                          color: "#9ca3af",
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

                  // Simple heat coloring based on XG
                  let bg = "#f3f4f6";
                  if (xgVal > 1.7) bg = "#dcfce7"; // strong green
                  else if (xgVal < 1.1) bg = "#fee2e2"; // red
                  else bg = "#fef9c3"; // yellow

                  return (
                    <td
                      key={gw}
                      style={{
                        borderBottom: "1px solid #e5e7eb",
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
                            color: "#111827",
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
                            color: "#4b5563",
                          }}
                        >
                          ({hav})
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#111827",
                          }}
                        >
                          XG: {formatXG(xgVal)}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#111827",
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
                    borderBottom: "1px solid #e5e7eb",
                    padding: "6px 10px",
                    textAlign: "center",
                    minWidth: 130,
                    fontWeight: 600,
                    color: "#111827",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span>Total XG: {totals.totalXG.toFixed(2)}</span>
                    <span style={{ fontSize: 11, color: "#4b5563" }}>
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
    border: active ? "1px solid #2563eb" : "1px solid #d1d5db",
    background: active ? "#dbeafe" : "#f3f4f6",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: "#111827",
  };
}

export default TeamAdjustmentsPage;
