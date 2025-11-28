// src/Team_Analytics_rankings.jsx (or wherever this lives)
import React, { useEffect, useMemo, useState } from "react";
import { useStatsData } from "./Contexts/StatsContext";
import { useNavigate } from "react-router-dom";
import teamLogos from "./utils/team_logos";

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  black: "#000000",
  beige: "#f7ead6",
};

const METRICS = {
  XG_avg: "Offensive Index",
  XGC_avg: "Defensive Index",
  Elo_Rating: "ELO Rating",
  "XGH-XGA": "Home Attacking Effect",
  "XGCH-XGCA": "Home Defensive Effect",
};

const METRIC_DESCRIPTIONS = {
  XG_avg:
    "Offensive rating over time based on Goals and XG, adjusted for difficulty of opposition.",
  XGC_avg:
    "Defensive rating over time based on Goals conceded and XGC, adjusted for difficulty of opposition.",
  Elo_Rating:
    "Absolute rating over time based on result, adjusted for difficulty of opposition.",
  "XGH-XGA":
    "Difference in attacking index at home and away. Positive values indicate better attack at home.",
  "XGCH-XGCA":
    "Difference in defensive index at home and away. Positive values indicate better defence at home.",
};

const ASCENDING_METRICS = ["XGC_avg"]; // lower is better for conceded

export default function TeamAnalyticsList() {
  const { fetchIfNeeded, loading, TeamData, setselected_team } = useStatsData();
  const [selectedMetric, setSelectedMetric] = useState("XG_avg");
  const [rankingData, setRankingData] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

  useEffect(() => {
    if (!TeamData?.current || TeamData.current.length === 0) return;

    let data = TeamData.current
      .map((team) => {
        let value;
        if (selectedMetric === "XGH-XGA") {
          value = parseFloat(team.XGH || 0) - parseFloat(team.XGA || 0);
        } else if (selectedMetric === "XGCH-XGCA") {
          // note: same sign logic you had
          value = -1 * (parseFloat(team.XGCH || 0) - parseFloat(team.XGCA || 0));
        } else {
          value = parseFloat(team[selectedMetric] || 0);
        }
        const name = team.name || team.Team || "";
        return {
          name,
          value: Number.isFinite(value) ? Number(value.toFixed(2)) : 0,
        };
      })
      .filter((d) => d.name && !Number.isNaN(d.value));

    const sortFn = ASCENDING_METRICS.includes(selectedMetric)
      ? (a, b) => a.value - b.value
      : (a, b) => b.value - a.value;

    setRankingData(data.sort(sortFn));
  }, [TeamData, selectedMetric]);

  const { minValue, maxValue } = useMemo(() => {
    if (!rankingData.length) return { minValue: 0, maxValue: 1 };
    const vals = rankingData.map((d) => d.value);
    return { minValue: Math.min(...vals), maxValue: Math.max(...vals) };
  }, [rankingData]);

  const SkeletonRow = () => (
    <li
      style={{
        position: "relative",
        padding: "0.75rem 1rem",
      }}
    >
      <div className="animate-pulse">
        <div
          style={{
            height: "1.25rem",
            width: "50%",
            borderRadius: "999px",
            backgroundColor: "#111827",
            marginBottom: "0.35rem",
          }}
        />
        <div
          style={{
            height: "0.9rem",
            width: "30%",
            borderRadius: "999px",
            backgroundColor: "#111827",
          }}
        />
      </div>
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
          maxWidth: "56rem",
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
              fontSize: "1.75rem",
              fontWeight: 700,
            }}
          >
            Team Rankings
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
            {METRIC_DESCRIPTIONS[selectedMetric]}
          </p>
        </header>

        {/* Controls */}
        <section
          style={{
            marginBottom: "1.5rem",
            borderRadius: "1rem",
            border: `1px solid ${PALETTE.gold}`,
            background:
              "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(90,0,0,0.9))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.8)",
            padding: "1rem 1.25rem",
          }}
        >
          <div
            style={{
              maxWidth: "18rem",
              margin: "0 auto",
            }}
          >
            <label
              htmlFor="metric"
              style={{
                display: "block",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#e5e7eb",
                marginBottom: "0.25rem",
              }}
            >
              Metric
            </label>
            <select
              id="metric"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              style={{
                height: "2.4rem",
                width: "100%",
                borderRadius: "0.6rem",
                border: `1px solid ${PALETTE.gold}`,
                backgroundColor: "rgba(0,0,0,0.9)",
                color: PALETTE.beige,
                padding: "0 0.75rem",
                fontSize: "0.9rem",
                textAlign: "center",
                outline: "none",
              }}
              aria-label="Select ranking metric"
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
        </section>

        {/* Rankings */}
        <section>
          <div
            style={{
              width: "100%",
              maxWidth: "44rem",
              margin: "0 auto",
              borderRadius: "1rem",
              border: `1px solid ${PALETTE.gold}`,
              background:
                "linear-gradient(155deg, rgba(0,0,0,0.98), rgba(0,0,0,0.9))",
              boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
              overflow: "hidden",
            }}
          >
            {loading ? (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </ul>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {rankingData.map((team, idx) => {
                  const denom = maxValue - minValue;
                  const pct =
                    denom <= 0
                      ? 100
                      : ((team.value - minValue) / denom) * 100;

                  return (
                    <li
                      key={team.name}
                      onClick={() => {
                        if (typeof setselected_team === "function") {
                          setselected_team(team.name);
                        }
                        navigate("/Team_Analytics/Team_Individual", {
                          state: { selectedTeam: team.name },
                        });
                      }}
                      title={`View ${team.name}`}
                      style={{
                        position: "relative",
                        padding: "0.75rem 1rem",
                        cursor: "pointer",
                        borderBottom: "1px solid #111827",
                        overflow: "hidden",
                      }}
                    >
                      {/* Background bar */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: `${pct}%`,
                          background:
                            "linear-gradient(90deg, rgba(184,134,11,0.35), rgba(184,134,11,0.05))",
                          transformOrigin: "left",
                          transition: "width 0.3s ease-out, opacity 0.2s",
                          opacity: 0.95,
                        }}
                      />

                      {/* Foreground content */}
                      <div
                        style={{
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          zIndex: 1,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            minWidth: 0,
                          }}
                        >
                          {/* Rank */}
                          <span
                            style={{
                              color: PALETTE.gold,
                              fontWeight: 700,
                              width: "2rem",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {idx + 1}.
                          </span>

                          {/* Logo + name */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              minWidth: 0,
                            }}
                          >
                            {teamLogos[team.name] ? (
                              <img
                                src={teamLogos[team.name]}
                                alt={`${team.name} logo`}
                                style={{
                                  height: "1.5rem",
                                  width: "1.5rem",
                                  objectFit: "contain",
                                  flexShrink: 0,
                                  filter:
                                    "drop-shadow(0 0 6px rgba(0,0,0,0.7))",
                                }}
                                onError={(e) => {
                                  e.currentTarget.style.visibility = "hidden";
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  height: "1.5rem",
                                  width: "1.5rem",
                                  display: "inline-block",
                                }}
                              />
                            )}
                            <span
                              style={{
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                fontSize: "0.95rem",
                              }}
                            >
                              {team.name}
                            </span>
                          </div>
                        </div>

                        {/* Value */}
                        <span
                          style={{
                            fontWeight: 600,
                            color: PALETTE.gold,
                            fontVariantNumeric: "tabular-nums",
                            fontSize: "0.95rem",
                          }}
                        >
                          {team.value.toFixed(2)}
                        </span>
                      </div>
                    </li>
                  );
                })}

                {rankingData.length === 0 && !loading && (
                  <li
                    style={{
                      padding: "1.25rem",
                      textAlign: "center",
                      color: "#9ca3af",
                    }}
                  >
                    No teams available.
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
