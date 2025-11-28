import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import Slider from "@mui/material/Slider";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useNavigate } from "react-router-dom";
import { useStatsData } from "./Contexts/StatsContext";

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  black: "#000000",
  beige: "#f7ead6",
};

const METRICS = {
  Points_prediction: "Points Predicted",
  Goal_pred: "Goals Predicted",
  Assist_pred: "Assists Predicted",
  Rolling_adjusted_XG: "Goal Index",
  Rolling_adjusted_XA: "Assist Index",
  Rolling_adjusted_BPS: "Bonus Index",
  DefCon: "DefCon Index",
};

const SUM_METRICS = ["Points_prediction", "Goal_pred", "Assist_pred"];

export default function Player_analytics_rankings() {
  const [rawData, setRawData] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState("Points_prediction");
  const [selectedPos, setSelectedPos] = useState("ALL");
  const [GWRange, setGWRange] = useState([1, 38]);
  const [minGW, setMinGW] = useState(null);
  const [maxGW, setMaxGW] = useState(null);
  const [valueRange, setValueRange] = useState([0, 15]);
  const [minValuePrice, setMinValuePrice] = useState(0);
  const [maxValuePrice, setMaxValuePrice] = useState(15);

  const navigate = useNavigate();
  const { fetchIfNeeded, loading, PlayersData } = useStatsData();

  useEffect(() => {
    const loadData = async () => {
      await fetchIfNeeded();
      if (PlayersData.current && PlayersData.current.length > 0) {
        const data = PlayersData.current;
        setRawData(data);

        const GWs = data
          .map((d) => d.GW)
          .filter((n) => Number.isFinite(n));
        const prices = data.map((d) => d.value || 0);

        const minGWVal = Math.min(...GWs);
        const maxGWVal = Math.max(...GWs);
        const minPrice = Math.floor(Math.min(...prices));
        const maxPrice = Math.ceil(Math.max(...prices));

        setMinGW(minGWVal);
        setMaxGW(maxGWVal);
        setGWRange([minGWVal, maxGWVal]);
        setMinValuePrice(minPrice);
        setMaxValuePrice(maxPrice);
        setValueRange([minPrice, maxPrice]);
      }
    };
    loadData();
  }, [fetchIfNeeded, PlayersData]);

  useEffect(() => {
    let data = [...rawData];

    if (selectedPos !== "ALL") {
      data = data.filter((d) => d.position === selectedPos);
    }

    data = data.filter(
      (d) => d.value >= valueRange[0] && d.value <= valueRange[1]
    );

    if (selectedMetric === "DefCon") {
      data = data.filter((d) => {
        const v = Number(d.DefCon);
        return Number.isFinite(v) && v <= 14;
      });
    }

    let aggregated;

    if (SUM_METRICS.includes(selectedMetric)) {
      const filteredByGW = data.filter(
        (d) => d.GW >= GWRange[0] && d.GW <= GWRange[1]
      );

      aggregated = Object.values(
        filteredByGW.reduce((acc, curr) => {
          if (!acc[curr.name]) {
            acc[curr.name] = {
              id: curr.name,
              web_name: curr.web_name,
              value: 0,
            };
          }
          acc[curr.name].value += parseFloat(curr[selectedMetric] || 0);
          return acc;
        }, {})
      );
    } else {
      const latestGW = Math.max(...data.map((d) => d.GW));
      const latestData = data.filter((d) => d.GW === latestGW);

      aggregated = latestData.map((d) => ({
        id: d.name,
        web_name: d.web_name,
        value: parseFloat(d[selectedMetric] || 0),
      }));
    }

    setFiltered(
      aggregated
        .sort((a, b) => b.value - a.value)
        .slice(0, 20)
    );
  }, [rawData, selectedMetric, GWRange, selectedPos, valueRange]);

  const minValue = filtered.length
    ? Math.min(...filtered.map((d) => d.value))
    : 0;
  const maxValue = filtered.length
    ? Math.max(...filtered.map((d) => d.value))
    : 1;

  const SkeletonRow = () => (
    <li
      style={{
        position: "relative",
        padding: "0.75rem 1rem",
      }}
    >
      <div
        style={{
          height: "1.4rem",
          width: "50%",
          backgroundColor: "#111827",
          borderRadius: "0.4rem",
          marginBottom: "0.35rem",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <div
        style={{
          height: "1rem",
          width: "33%",
          backgroundColor: "#111827",
          borderRadius: "0.4rem",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
    </li>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "1.5rem 1rem 2.5rem",
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #000000 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <header
          style={{
            marginBottom: "1.75rem",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.9rem",
              fontWeight: 700,
            }}
          >
            Player Rankings
          </h1>
          <p
            style={{
              marginTop: "0.4rem",
              fontSize: "0.85rem",
              color: "#d1c3a9",
              maxWidth: "40rem",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Rank top performers by predicted output or form indexes. Refine by
            position, price, and gameweeks.
          </p>
        </header>

        {/* Controls card */}
        <section
          style={{
            marginBottom: "1.75rem",
            borderRadius: "1rem",
            border: `1px solid ${PALETTE.gold}`,
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(90,0,0,0.9))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.9)",
            padding: "1rem 1.25rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
              alignItems: "flex-start",
            }}
          >
            {/* Metric select */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#d1c3a9",
                }}
              >
                Metric
              </label>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                aria-label="Select ranking metric"
                style={{
                  height: "2.4rem",
                  width: "100%",
                  borderRadius: "0.6rem",
                  border: `1px solid ${PALETTE.gold}`,
                  backgroundColor: "rgba(0,0,0,0.9)",
                  color: PALETTE.beige,
                  padding: "0 0.75rem",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              >
                {Object.entries(METRICS).map(([key, label]) => (
                  <option
                    key={key}
                    value={key}
                    style={{
                      backgroundColor: "#000000",
                      color: PALETTE.beige,
                    }}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Positions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#d1c3a9",
                }}
              >
                Positions
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                {["ALL", "GKP", "DEF", "MID", "FWD"].map((pos) => {
                  const active = selectedPos === pos;
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setSelectedPos(pos)}
                      aria-pressed={active}
                      style={{
                        height: "2.2rem",
                        padding: "0 0.9rem",
                        borderRadius: "999px",
                        border: `1px solid ${
                          active ? PALETTE.gold : "rgba(148,163,184,0.5)"
                        }`,
                        backgroundColor: active
                          ? PALETTE.gold
                          : "rgba(0,0,0,0.7)",
                        color: active ? PALETTE.black : PALETTE.beige,
                        fontSize: "0.8rem",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {pos}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price slider */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#d1c3a9",
                }}
              >
                Price Range
              </label>
              <Box sx={{ width: "100%" }}>
                <Typography
                  gutterBottom
                  sx={{
                    fontSize: "0.75rem",
                    color: "#e5e7eb",
                    mb: 0.5,
                  }}
                >
                  {valueRange[0]}M – {valueRange[1]}M
                </Typography>
                <Slider
                  value={valueRange}
                  min={minValuePrice}
                  max={maxValuePrice}
                  onChange={(e, newVal) => setValueRange(newVal)}
                  valueLabelDisplay="auto"
                  step={0.1}
                  sx={{ color: PALETTE.gold }}
                  aria-label="Filter by price range"
                />
              </Box>
            </div>
          </div>

          {/* GW slider (only for sum metrics) */}
          {SUM_METRICS.includes(selectedMetric) &&
            minGW != null &&
            maxGW != null && (
              <div style={{ marginTop: "1rem" }}>
                <label
                  style={{
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#d1c3a9",
                    display: "block",
                    marginBottom: "0.2rem",
                  }}
                >
                  GW Range
                </label>
                <Box sx={{ width: "100%" }}>
                  <Typography
                    gutterBottom
                    sx={{
                      fontSize: "0.75rem",
                      color: "#e5e7eb",
                      mb: 0.5,
                    }}
                  >
                    {GWRange[0]} – {GWRange[1]}
                  </Typography>
                  <Slider
                    value={GWRange}
                    min={minGW}
                    max={maxGW}
                    onChange={(e, newVal) => setGWRange(newVal)}
                    valueLabelDisplay="auto"
                    step={1}
                    sx={{ color: PALETTE.gold }}
                    aria-label="Filter by gameweek range"
                  />
                </Box>
              </div>
            )}
        </section>

        {/* Rankings list */}
        <section>
          {loading ? (
            <ul
              style={{
                width: "100%",
                maxWidth: "48rem",
                margin: "0 auto",
                borderRadius: "1rem",
                border: `1px solid ${PALETTE.gold}`,
                background:
                  "linear-gradient(145deg, rgba(0,0,0,0.97), rgba(0,0,0,0.9))",
                boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
                listStyle: "none",
                padding: 0,
                marginBottom: "1.5rem",
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </ul>
          ) : (
            <ul
              style={{
                width: "100%",
                maxWidth: "48rem",
                margin: "0 auto",
                borderRadius: "1rem",
                border: `1px solid ${PALETTE.gold}`,
                background:
                  "linear-gradient(145deg, rgba(0,0,0,0.97), rgba(0,0,0,0.9))",
                boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
                listStyle: "none",
                padding: 0,
                marginBottom: "1.5rem",
              }}
            >
              {filtered.map((player, idx) => {
                const percentage =
                  maxValue === minValue
                    ? 100
                    : ((player.value - minValue) /
                        (maxValue - minValue)) *
                      100;
                const displayName = player.web_name;
                return (
                  <li
                    key={player.id}
                    onClick={() =>
                      navigate("/Player_Analytics/Individual", {
                        state: { selectedPlayer: player.id },
                      })
                    }
                    title={`View ${displayName}`}
                    style={{
                      position: "relative",
                      padding: "0.7rem 1rem",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(31,41,55,0.8)",
                      overflow: "hidden",
                    }}
                  >
                    {/* background bar */}
                    <div
                      style={{
                        position: "absolute",
                        insetBlock: 0,
                        left: 0,
                        width: `${percentage}%`,
                        backgroundColor: "rgba(184,134,11,0.22)",
                        borderTopRightRadius: "999px",
                        borderBottomRightRadius: "999px",
                        transition: "width 0.3s ease",
                      }}
                    />

                    <div
                      style={{
                        position: "relative",
                        zIndex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            color: PALETTE.gold,
                            fontWeight: 700,
                            width: "1.6rem",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {idx + 1}.
                        </span>
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontSize: "0.9rem",
                          }}
                        >
                          {displayName}
                        </span>
                      </div>
                      <span
                        style={{
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          color: PALETTE.gold,
                          fontSize: "0.9rem",
                        }}
                      >
                        {player.value.toFixed(2)}
                      </span>
                    </div>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li
                  style={{
                    padding: "1.25rem 1rem",
                    textAlign: "center",
                    color: "#d1c3a9",
                    fontSize: "0.9rem",
                  }}
                >
                  No players match your filters.
                </li>
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
