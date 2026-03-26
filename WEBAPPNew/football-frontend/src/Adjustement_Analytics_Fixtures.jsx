// src/Pages/FixturesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAdjustmentData } from "./Contexts/AdjustmentsContext";

import teamLogos from "./utils/team_logos";

const PALETTE = {
  red: "#f8fafc",
  gold: "#76AFA0",
  black: "#e2e8f0",
  beige: "#1e293b",
};

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// "current GW" = option with highest p (ties: first)
const currentGwOfFixture = (fx) => {
  const opts = (fx.options || []).map((o) => ({
    gw: toNum(o.gw, 1),
    p: toNum(o.p, 0),
  }));
  if (!opts.length) return null;
  return opts.reduce((best, o) => (o.p > best.p ? o : best), opts[0]).gw;
};

function logosForTeams(homeTeam, awayTeam) {
  return {
    home: teamLogos?.[homeTeam] || null,
    away: teamLogos?.[awayTeam] || null,
  };
}

const pctSteps = Array.from({ length: 11 }, (_, i) => i * 10); // 0..100

// Convert stored options (p in 0..1) to UI draft options (p in 0..100).
// If no options exist, default to 100% at fallbackGw.
const optionsToPct = (fxOptions, fallbackGw) => {
  const arr = (fxOptions || []).map((o) => ({
    gw: toNum(o.gw, fallbackGw),
    p: Math.round(toNum(o.p, 0) * 100),
  }));
  if (arr.length === 0) return [{ gw: toNum(fallbackGw, 1), p: 100 }];
  arr.sort((a, b) => toNum(a.gw, 1) - toNum(b.gw, 1));
  return arr;
};

export default function FixturesPage() {
  const { fetchIfNeeded, loading, Fixtures, fixturesVersion, updateFixture } =
    useAdjustmentData();

  useEffect(() => {
    fetchIfNeeded();
  }, [fetchIfNeeded]);

  const fixtures = useMemo(
    () => Fixtures.current || [],
    [Fixtures, fixturesVersion]
  );

  // Minimal GW across the whole horizon (based on any option.gw if present,
  // otherwise falls back to the fixture's "current" GW).
  const minHorizonGW = useMemo(() => {
    let min = Infinity;

    for (const fx of fixtures) {
      const opts = fx.options || [];
      if (opts.length) {
        for (const o of opts) {
          const g = toNum(o.gw, null);
          if (Number.isFinite(g)) min = Math.min(min, g);
        }
      } else {
        const g = currentGwOfFixture(fx);
        if (Number.isFinite(g)) min = Math.min(min, g);
      }
    }

    return min === Infinity ? 1 : min;
  }, [fixtures]);

  const availableGWs = useMemo(() => {
    const set = new Set();
    for (const fx of fixtures) {
      const gw = currentGwOfFixture(fx);
      if (Number.isFinite(gw)) set.add(gw);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [fixtures]);

  const [selectedGW, setSelectedGW] = useState(null);

  // Local drafts keyed by fixtureId: { [id]: { options: [{gw,p}], dirty } }
  // Draft options store p as percent 0..100 (NOT 0..1).
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    if (selectedGW != null) return;
    if (availableGWs.length) setSelectedGW(availableGWs[0]);
  }, [availableGWs, selectedGW]);

  const fixturesForGW = useMemo(() => {
    if (selectedGW == null) return [];
    return fixtures
      .filter((fx) => currentGwOfFixture(fx) === selectedGW)
      .sort((a, b) => (a.homeTeam || "").localeCompare(b.homeTeam || ""));
  }, [fixtures, selectedGW]);

  // Ensure drafts exist for visible fixtures (draft p is always 0..100)
  useEffect(() => {
    if (!fixturesForGW.length) return;

    setDrafts((prev) => {
      const next = { ...prev };
      for (const fx of fixturesForGW) {
        if (!next[fx.id]) {
          next[fx.id] = {
            options: optionsToPct(fx.options, selectedGW ?? 1),
            dirty: false,
          };
        }
      }
      return next;
    });
  }, [fixturesForGW, selectedGW]);

  const gwIndex = selectedGW != null ? availableGWs.indexOf(selectedGW) : -1;

    const gwChoices = useMemo(() => {
    const min = toNum(minHorizonGW, 1);
    const arr = [];
    for (let g = min; g <= 38; g += 1) arr.push(g);
    return arr;
  }, [minHorizonGW]);

  if (loading && fixtures.length === 0) {
    return <div style={pageStyle}>Loading fixtures…</div>;
  }
  if (!loading && fixtures.length === 0) {
    return <div style={pageStyle}>No fixtures found.</div>;
  }

  const setDraftOption = (fixtureId, idx, patch) => {
    setDrafts((prev) => {
      const cur = prev[fixtureId] || { options: [], dirty: false };
      const options = [...(cur.options || [])];
      options[idx] = { ...options[idx], ...patch };
      options.sort((a, b) => toNum(a.gw, 1) - toNum(b.gw, 1));
      return { ...prev, [fixtureId]: { options, dirty: true } };
    });
  };

  const addDraftOption = (fixtureId) => {
    setDrafts((prev) => {
      const cur = prev[fixtureId] || { options: [], dirty: false };
      const options = [...(cur.options || [])];

      // Default new option: selected GW, 0% (user can distribute probability)
      options.push({ gw: selectedGW ?? 1, p: 0 });

      options.sort((a, b) => toNum(a.gw, 1) - toNum(b.gw, 1));
      return { ...prev, [fixtureId]: { options, dirty: true } };
    });
  };

  const removeDraftOption = (fixtureId, idx) => {
    setDrafts((prev) => {
      const cur = prev[fixtureId] || { options: [], dirty: false };
      const options = [...(cur.options || [])];
      options.splice(idx, 1);

      // If we removed the last option, default back to 100% on selected GW
      if (options.length === 0) options.push({ gw: selectedGW ?? 1, p: 100 });

      options.sort((a, b) => toNum(a.gw, 1) - toNum(b.gw, 1));
      return { ...prev, [fixtureId]: { options, dirty: true } };
    });
  };

  const revertDraft = (fixtureId, fxOptionsAsPct) => {
    setDrafts((prev) => ({
      ...prev,
      [fixtureId]: {
        options: (fxOptionsAsPct || []).map((o) => ({
          gw: toNum(o.gw, selectedGW ?? 1),
          p: toNum(o.p, 0),
        })),
        dirty: false,
      },
    }));
  };

  const commitDraft = (fixtureId) => {
    const draft = drafts[fixtureId];
    if (!draft) return;

    // Draft stores p as percent 0..100; persist as 0..1
    const committedOptionsPct = (draft.options || []).map((o) => ({
      gw: toNum(o.gw, selectedGW ?? 1),
      p: toNum(o.p, 0),
    }));

    const options01 = committedOptionsPct.map((o) => ({
      ...o,
      p: o.p / 100,
    }));

    updateFixture(fixtureId, (old) => ({
      ...old,
      options: options01,
    }));

    setDrafts((prev) => ({
      ...prev,
      [fixtureId]: { options: committedOptionsPct, dirty: false },
    }));
  };

  // GW dropdown inside each fixture option:
  // allow picking earlier GWs, but NOT earlier than the minimal GW across the horizon.


  return (
    <div style={pageStyle}>
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Fixtures</h1>
            <p
              style={{
                margin: 0,
                color: "#64748b",
                fontSize: 13,
                maxWidth: 760,
              }}
            >
              Edit fixture scheduling uncertainty. Changes are only saved after
              pressing <b>Update</b>.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              disabled={gwIndex <= 0}
              onClick={() => setSelectedGW(availableGWs[gwIndex - 1])}
              style={btnStyle(false, gwIndex <= 0)}
            >
              ← Prev GW
            </button>

            <select
              value={selectedGW ?? ""}
              onChange={(e) => setSelectedGW(toNum(e.target.value))}
              style={selectStyle}
            >
              {availableGWs.map((gw) => (
                <option key={gw} value={gw}>
                  GW {gw}
                </option>
              ))}
            </select>

            <button
              disabled={gwIndex === -1 || gwIndex >= availableGWs.length - 1}
              onClick={() => setSelectedGW(availableGWs[gwIndex + 1])}
              style={btnStyle(
                false,
                gwIndex === -1 || gwIndex >= availableGWs.length - 1
              )}
            >
              Next GW →
            </button>
          </div>
        </div>

        <div style={{ marginTop: 6, color: "#64748b", fontSize: 12 }}>
          Showing <b>{fixturesForGW.length}</b> fixtures in{" "}
          <b>GW {selectedGW ?? "-"}</b>. (Earliest GW allowed in options:{" "}
          <b>GW {minHorizonGW}</b>)
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {fixturesForGW.map((fx) => {
          // Saved options as percent for UI (and default to 100% if missing)
          const savedAsPct = optionsToPct(fx.options, selectedGW ?? 1);

          const draft = drafts[fx.id] || { options: savedAsPct, dirty: false };

          const { home, away } = logosForTeams(fx.homeTeam, fx.awayTeam);

          return (
            <div key={fx.id} style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 260,
                  }}
                >
                  <TeamBadge name={fx.homeTeam} logo={home} />
                  <span style={{ color: PALETTE.gold, fontWeight: 800 }}>
                    vs
                  </span>
                  <TeamBadge name={fx.awayTeam} logo={away} />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() => addDraftOption(fx.id)}
                    style={btnStyle(false)}
                  >
                    + Add option
                  </button>

                  <div style={{ width: 10 }} />

                  <button
                    onClick={() => revertDraft(fx.id, savedAsPct)}
                    disabled={!draft.dirty}
                    style={btnStyle(false, !draft.dirty)}
                  >
                    Revert
                  </button>
                  <button
                    onClick={() => commitDraft(fx.id)}
                    disabled={!draft.dirty}
                    style={btnStyle(true, !draft.dirty)}
                  >
                    Update
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                    color: PALETTE.beige,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>GW</th>
                      <th style={thStyle}>Probability</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(draft.options || []).map((opt, idx) => (
                      <tr key={`${fx.id}_${idx}`}>
                        <td style={tdStyle}>
                          <select
                            value={toNum(opt.gw, selectedGW ?? 1)}
                            onChange={(e) =>
                              setDraftOption(fx.id, idx, {
                                gw: toNum(e.target.value, selectedGW ?? 1),
                              })
                            }
                            style={smallSelectStyle}
                          >
                            {gwChoices.map((gw) => (
                              <option key={gw} value={gw}>
                                GW {gw}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td style={tdStyle}>
                          <select
                            value={toNum(opt.p, 0)}
                            onChange={(e) =>
                              setDraftOption(fx.id, idx, {
                                p: toNum(e.target.value, 0),
                              })
                            }
                            style={smallSelectStyle}
                          >
                            {pctSteps.map((p) => (
                              <option key={p} value={p}>
                                {p}%
                              </option>
                            ))}
                          </select>
                        </td>

                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <button
                            onClick={() => removeDraftOption(fx.id, idx)}
                            style={removeBtnStyle}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
                  Probabilities are in 10% steps. Click <b>Update</b> to apply.
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamBadge({ name, logo }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {logo ? (
        <img
          src={logo}
          alt={`${name} logo`}
          style={{
            height: 26,
            width: 26,
            borderRadius: 999,
            objectFit: "contain",
            backgroundColor: "#ffffff",
            border: `1px solid ${PALETTE.gold}`,
          }}
        />
      ) : (
        <div
          style={{
            height: 26,
            width: 26,
            borderRadius: 999,
            background: "#f1f5f9",
            border: `1px solid ${PALETTE.gold}`,
          }}
        />
      )}
      <span
        style={{
          fontWeight: 800,
          fontSize: 13,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 160,
        }}
        title={name}
      >
        {name}
      </span>
    </div>
  );
}

const pageStyle = {
  padding: "1.5rem",
  minHeight: "100vh",
  background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #e2e8f0 100%)`,
  color: PALETTE.beige,
  fontFamily:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const cardStyle = {
  border: `1px solid ${PALETTE.gold}`,
  borderRadius: 12,
  background: "#ffffff",
  boxShadow: "0 12px 24px rgba(15,23,42,0.12)",
  padding: 12,
  overflow: "hidden",
};

const thStyle = {
  textAlign: "left",
  padding: "8px 8px",
  borderBottom: `1px solid ${PALETTE.gold}`,
  fontSize: 12,
  color: PALETTE.gold,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "8px 8px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const selectStyle = {
  padding: "8px 10px",
  borderRadius: 999,
  border: `1px solid ${PALETTE.gold}`,
  background: "#ffffff",
  color: PALETTE.beige,
  outline: "none",
  fontSize: 13,
};

const smallSelectStyle = {
  padding: "6px 10px",
  borderRadius: 10,
  border: `1px solid ${PALETTE.gold}`,
  background: "#ffffff",
  color: PALETTE.beige,
  outline: "none",
  fontSize: 13,
  minWidth: 140,
};

const btnStyle = (active, disabled = false) => ({
  padding: "8px 10px",
  borderRadius: 999,
  border: active ? `1px solid ${PALETTE.gold}` : "1px solid #cbd5e1",
  background: active ? "rgba(118,175,160,0.18)" : "#f8fafc",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
  fontSize: 12,
  fontWeight: active ? 800 : 600,
  color: PALETTE.beige,
});

const removeBtnStyle = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: PALETTE.beige,
  cursor: "pointer",
  fontSize: 12,
};




