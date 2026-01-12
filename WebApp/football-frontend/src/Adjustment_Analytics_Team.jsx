import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useAdjustmentData, fixtureIdFromRow } from "./Contexts/AdjustmentsContext";
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
  const { fetchIfNeeded, loading, Teamdata, updateTeamData,dataVersion, forceRefetch,Fixtures,fixturesVersion,} = useAdjustmentData();
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
    updateTeamData(withMetrics)
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
      const id = fixtureIdFromRow({
        ...r,
        Opponent_team: r.Opponent_team, // ensure correct field used
      });

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
    const gws = Array.from(gwSet).sort((a, b) => a - b);

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

      const id = fixtureIdFromRow({
        ...r,
        Opponent_team: r.Opponent_team,
      });

      const dist =
        optionsById.get(id)?.length
          ? optionsById.get(id)
          : [{ gw: Number(r.GW), p: 1 }];

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

    // totals
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
      updateTeamData(withMetrics);
      return withMetrics;
    });
  };

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
    const ownAttE = Number(r.own_H_Att_E ?? 0)*0.5;
    const oppDefE = Number(r.opponent_H_def_E ?? 0)*0.5;
    const ownDEFE = Number(r.own_H_def_E ?? 0)*0.5;
    const oppATTE = Number(r.opponent_H_Att_E ?? 0)*0.5;

    // Baseline: keep the very first strengths as base_* (if not already set)
    const base_own_XG_avg =
      r.base_own_XG_avg != null ? r.base_own_XG_avg : ownXG;
    const base_own_XGC_avg =
      r.base_own_XGC_avg != null ? r.base_own_XGC_avg : ownXGC;

    // XG formula (home/away adjustments)
    let xg;
    if (r.Home === "H") {
      xg =-0.17+
        (ownXG + ownAttE) * 0.37 +
        0.37 * (oppXGC - oppDefE) +
         0.275* ((ownXG + ownAttE)) * ((oppXGC - oppDefE));
    } else {
      xg =-0.17+
        (ownXG - ownAttE) * 0.37 +
        0.37 * (oppXGC + oppDefE) +
         0.275* ((ownXG - ownAttE)) * ((oppXGC + oppDefE));
    }

    // CS formula: 0.4 / (0.6 * own_XGC_avg + 0.4 * opponent_XG_avg)
    const denom = 0.5 * ownXGC + 0.5 * oppXG;

    let csProb;
    if (r.Home === "H") {
      csProb =0.65+
        (ownXGC + ownDEFE) * -0.16 +
        -0.15 * (oppXG - oppATTE) +
         0.01* ((ownXGC + ownDEFE)) * ((oppXG - oppATTE));
    } else {
      csProb =0.58+
        (ownXGC - ownDEFE) * -0.08 +
        -0.13 * (oppXG + oppATTE) +
         0.01* ((ownXGC - ownDEFE)) * ((oppXG + oppATTE));
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

/* ========== Scatter plot with draggable logo dots + arrows (seamless) ========== */

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
        // helps touch dragging feel better
        touchAction: "none",
      }}
    >
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
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

function DraggableDot({
  cx = 0,
  cy = 0,
  payload,
  xAxis,
  yAxis,
  bounds,
  onTeamDrag,
}) {
  const nodeRef = useRef(null);

  // Seamless drag state
  const [dragging, setDragging] = useState(false);
  const [dragPx, setDragPx] = useState(null); // current pixel x within chart coords
  const [dragPy, setDragPy] = useState(null); // current pixel y within chart coords
  const pointerIdRef = useRef(null);

  // Snap step in data units (tweak to taste)
  const SNAP_X = 0.05;
  const SNAP_Y = 0.05;

  const logoUrl = payload?.logo;
  const size = 26;

  // Helpers ----------------------------------------------------------

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const snap = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

  // chart pixel ranges from the real Recharts scales
  const xRange = xAxis?.scale?.range?.() ?? [0, 0];
  const yRange = yAxis?.scale?.range?.() ?? [0, 0]; // often [innerHeight, 0]

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

    // clamp within plot area, then invert
    const clampedPx = clamp(px, xMinPx, xMaxPx);
    const clampedPy = clamp(py, yMinPx, yMaxPx);

    let xVal = xScale.invert(clampedPx);
    let yVal = yScale.invert(clampedPy);

    // clamp to domain (your fixed bounds)
    xVal = clamp(xVal, bounds.minX, bounds.maxX);
    yVal = clamp(yVal, bounds.minY, bounds.maxY);

    // snap to grid-ish increments
    xVal = snap(xVal, SNAP_X);
    yVal = snap(yVal, SNAP_Y);

    // clamp again after snapping
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

  // Baseline → current arrow (baseline in data space, current can be drag position)
  const arrowLine = useMemo(() => {
    const origX = payload?.orig_XG_avg;
    const origY = payload?.orig_XGC_avg;
    if (origX == null || origY == null) return null;

    const currX = payload?.own_XG_avg;
    const currY = payload?.own_XGC_avg;

    const currPixel =
      dragging && dragPx != null && dragPy != null
        ? { px: dragPx, py: dragPy }
        : dataToPixel(currX, currY);

    const origPixel = dataToPixel(origX, origY);

    if (!currPixel || !origPixel) return null;

    // In local <g>, the dot center is at (0,0), so line starts at (orig - curr)
    const dx = origPixel.px - currPixel.px;
    const dy = origPixel.py - currPixel.py;

    return { x1: dx, y1: dy, x2: 0, y2: 0 };
  }, [payload, xAxis, yAxis, dragging, dragPx, dragPy]);

  // Live snapped values + snapped pixel (for crosshair + label)
  const live = useMemo(() => {
    if (!dragging || dragPx == null || dragPy == null) return null;

    const d = pixelToData(dragPx, dragPy);
    if (!d) return null;

    const snappedPix = dataToPixel(d.xVal, d.yVal);
    if (!snappedPix) return null;

    return {
      xVal: d.xVal,
      yVal: d.yVal,
      px: snappedPix.px,
      py: snappedPix.py,
    };
  }, [dragging, dragPx, dragPy, xAxis, yAxis]);

  // Pointer handlers -------------------------------------------------

  const onPointerDown = (e) => {
    if (!payload) return;

    // capture pointer (works for mouse + touch)
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
    if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) {
      return;
    }

    const p = svgPointFromClient(e.clientX, e.clientY);
    if (!p) return;

    setDragPx(clamp(p.x, xMinPx, xMaxPx));
    setDragPy(clamp(p.y, yMinPx, yMaxPx));
  };

  const finishDrag = () => {
    if (!dragging) return;

    // commit on drop
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
    if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) {
      return;
    }
    finishDrag();
  };

  const onPointerCancel = (e) => {
    if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) {
      return;
    }
    finishDrag();
  };

  // Render position: if dragging, show the icon under the pointer (snapped)
  const renderCx = dragging && live ? live.px : cx;
  const renderCy = dragging && live ? live.py : cy;

  // Crosshair extents (full plot area)
  const crosshair = dragging && live
    ? {
        x: live.px,
        y: live.py,
        x1: xMinPx,
        x2: xMaxPx,
        y1: yMinPx,
        y2: yMaxPx,
      }
    : null;

  // -----------------------------------------------------------------

  return (
    <g transform={`translate(${renderCx}, ${renderCy})`} ref={nodeRef}>
      {/* Crosshair + live value badge while dragging */}
      {crosshair && (
        <g style={{ pointerEvents: "none" }}>
          <line
            x1={crosshair.x1 - crosshair.x}
            y1={0}
            x2={crosshair.x2 - crosshair.x}
            y2={0}
            stroke="#666"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <line
            x1={0}
            y1={crosshair.y1 - crosshair.y}
            x2={0}
            y2={crosshair.y2 - crosshair.y}
            stroke="#666"
            strokeDasharray="4 4"
            strokeWidth={1}
          />

          {/* snapped point marker */}
          <circle r={3.5} fill={PALETTE.gold} />

          {/* value badge */}
          <g transform="translate(14,-14)">
            <rect
              x={0}
              y={-18}
              rx={6}
              ry={6}
              width={150}
              height={34}
              fill="#111"
              stroke={PALETTE.gold}
              strokeWidth={1}
              opacity={0.95}
            />
            <text x={8} y={-4} fontSize={11} fill={PALETTE.beige}>
              Off: {live.xVal.toFixed(2)}  |  Def: {live.yVal.toFixed(2)}
            </text>
          </g>
        </g>
      )}

      {/* Arrow baseline -> current (updates during drag) */}
      {arrowLine && (
        <line
          x1={arrowLine.x1}
          y1={arrowLine.y1}
          x2={arrowLine.x2}
          y2={arrowLine.y2}
          stroke="#888"
          strokeWidth={1}
          strokeDasharray="3 3"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Draggable hit target */}
      <g
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      >
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
    </g>
  );
}



/* ========== Fixture table (unchanged except logo use) ========== */

function FixturesTable({ tableData }) {
  const { gws, teams, cellMap, totalsByTeam } = tableData;

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
        const cell = cellMap.get(key(team, sortConfig.gw));
        return cell ? cell.expectedXG : 0;
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
  }, [teams, totalsByTeam, sortConfig, cellMap]);

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
          Total Goals
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
  const cell = cellMap.get(key(team, gw));
  if (!cell) {
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

  const xgVal = cell.expectedXG; // p-weighted
  const csVal = cell.expectedCS; // p-weighted

  // Build opponent summary from probability mix
  const oppSummary = (cell.opps || [])
    .slice()
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map((e) => `${e.opp} (${Math.round(e.p * 100)}%) ${e.hav}`)
    .join(" • ");

  // Simple heat coloring based on expected XG
  let bg = "#1f2933";
  if (xgVal > 1.7) bg = "rgba(22,163,74,0.45)";
  else if (xgVal < 1.1) bg = "rgba(220,38,38,0.45)";
  else bg = "rgba(202,138,4,0.45)";

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
          title={oppSummary}
        >
          {oppSummary || "—"}
        </span>

        <span style={{ fontSize: 11, color: PALETTE.beige }}>
          Goals: {formatXG(xgVal)}
        </span>

        <span style={{ fontSize: 11, color: PALETTE.beige }}>
          CS Odds: {formatCS(csVal)}
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
                      Total Goals: {totals.totalXG.toFixed(2)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#d1c3a9",
                      }}
                    >
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
