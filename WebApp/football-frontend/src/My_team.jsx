// src/pages/OptimizeTeam.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowRight, Search, BookmarkPlus } from "lucide-react";
import pitch from "./assets/Pitch4.png";
import { useMyteamData } from "./Contexts/MyTeamContext";
import { useAdjustmentData } from "./Contexts/AdjustmentsContext";

const PALETTE = {
  red: "#5A0000",
  gold: "#B8860B",
  black: "#000000",
  beige: "#f7ead6",
};

export default function MyTeamOptimize() {
  const {
    teamId,
    setTeamId,
    bbRound,
    setBbRound,
    wildRound,
    setWildRound,
    bannedList,
    freehitROund,
    setfreehitROund,
    data,
    loading,
    fetchTeam,
    toggleBan,
    removeBan,
    has_changed,
    sethas_changed,
    bannedPlayersData,
    n_hits,
    setn_hits,
    risk,
    setRisk,
    valtrans,
    setValtrans,

    savedOptimizations = [],
    saveOptimization,
    deleteOptimization,
    loadOptimization,
  } = useMyteamData();

  const { Playerdata, dataVersion } = useAdjustmentData();
  const navigate = useNavigate();

  const [modelType, setModelType] = useState("ai");
  const [optParamsOpen, setOptParamsOpen] = useState(true);

  // Save UI
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveHint, setSaveHint] = useState("");
  const [activeSavedId, setActiveSavedId] = useState(null);

  const hasStatisticalData = useMemo(() => {
    const arr = Playerdata?.current;
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.some(
      (p) => p && p.calc_points != null && Number.isFinite(Number(p.calc_points))
    );
  }, [Playerdata, dataVersion]);

  const clampRisk = (v) => Math.max(-1, Math.min(1, v));
  const formatRiskLabel = (v) => {
    const n = Number(v);
    if (n <= -0.3) return "Low risk";
    if (n >= 0.3) return "High risk";
    return "Neutral";
  };

  const clampValTrans = (v) => Math.max(0, Math.min(1, v));
  const formatValTransLabel = (v) => {
    const n = Number(v);
    if (n <= 0.1) return "Low value";
    if (n >= 0.9) return "High value";
    return "Neutral";
  };

  const handleApplyToPlanner = () => {
    if (!plannerPayload.length) return;
    navigate("/Team_Overview", {
      state: { optimizedTransfers: plannerPayload, applyId: Date.now() },
    });
  };

  useEffect(() => {
    if (modelType === "statistical" && !hasStatisticalData) {
      setModelType("ai");
    }
  }, [modelType, hasStatisticalData]);

  // UI state for chips
  const [showBbInput, setShowBbInput] = useState(!!bbRound);
  const [showWildInput, setShowWildInput] = useState(!!wildRound);
  const [showfreehitInput, setshowfreehitInput] = useState(!!freehitROund);
  const [chipsOpen, setChipsOpen] = useState(
    !!bbRound || !!wildRound || !!freehitROund
  );

  // Loading progress animation
  const [loadingPhase, setLoadingPhase] = useState("idle");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    sethas_changed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    teamId,
    bbRound,
    wildRound,
    bannedList,
    freehitROund,
    n_hits,
    modelType,
    risk,
    valtrans,
  ]);

  useEffect(() => {
    if (loading) {
      setLoadingPhase("fetch");
      setProgress(0);

      let rafId;
      const start = performance.now();
      const duration = 3000;

      const tick = (now) => {
        const elapsed = now - start;
        const pct = Math.min(40, (elapsed / duration) * 40);
        setProgress(pct);

        if (elapsed < duration && loading) {
          rafId = requestAnimationFrame(tick);
        } else if (loading) {
          setLoadingPhase("optimize");
          let p = Math.max(pct, 40);
          const iv = setInterval(() => {
            if (!loading) return clearInterval(iv);
            p = Math.min(98, p + 1);
            setProgress(p);
            if (p >= 98) clearInterval(iv);
          }, 200);
        }
      };

      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    } else {
      setProgress(100);
      const t = setTimeout(() => setProgress(0), 300);
      setLoadingPhase("idle");
      return () => clearTimeout(t);
    }
  }, [loading]);

  // --- Compute GWs and split squad ---
  let minGW = 1,
    maxGW = 38,
    starters = [],
    bench = [],
    transfers = [],
    gwData = [];

  if (data) {
    const gws = data.map((p) => Number(p.GW)).filter((n) => !isNaN(n));
    if (gws.length) {
      minGW = Math.min(...gws);
      maxGW = Math.min(38, minGW + 5);
    }
    gwData = data.filter((p) => Number(p.GW) === minGW);
    starters = gwData.filter((p) => p.status === "playing");
    bench = gwData.filter((p) => p.status === "benched");

    const moves = data.filter((p) =>
      ["transferred_in", "transferred_out"].includes(p.status)
    );
    transfers = Object.values(
      moves.reduce((acc, curr) => {
        if (!acc[curr.GW]) acc[curr.GW] = { GW: curr.GW, in: [], out: [] };
        acc[curr.GW][curr.status === "transferred_in" ? "in" : "out"].push(curr);
        return acc;
      }, {})
    ).sort((a, b) => Number(a.GW) - Number(b.GW));
  }

  // --- Total objective points ---
  let totalPredPoints = null;
  if (data) {
    const objRow =
      data.find((p) => p.Name === "Obj Value") ||
      (Array.isArray(gwData) && gwData.find((p) => p.Name === "Obj Value")) ||
      data.find((p) => p.Name === "__TOTAL_OBJECTIVE__");

    if (objRow) {
      const asNum =
        objRow.objective != null ? Number(objRow.objective) : Number(objRow.status);
      totalPredPoints = Number.isFinite(asNum) ? asNum : null;
    }
  }

  // --- Insert/mark Free Hit banner in correct GW order ---
  const toNum = (v) => Number(v);
  let transfersWithFH = transfers;

  if (data && Number.isFinite(minGW) && Number.isFinite(maxGW)) {
    const fhGW = Number(freehitROund);
    const fhActive = Number.isFinite(fhGW) && fhGW >= minGW - 1 && fhGW <= maxGW;

    if (fhActive) {
      const out = [...transfers].sort((a, b) => toNum(a.GW) - toNum(b.GW));
      const idx = out.findIndex((g) => toNum(g.GW) === fhGW);

      if (idx !== -1) out[idx] = { ...out[idx], freehit: true };
      else {
        const insertAt = out.findIndex((g) => toNum(g.GW) > fhGW);
        const fhGroup = { GW: fhGW, in: [], out: [], freehit: true };
        if (insertAt === -1) out.push(fhGroup);
        else out.splice(insertAt, 0, fhGroup);
      }

      transfersWithFH = out;
    }
  }

  // Planner payload
  const plannerPayload = useMemo(() => {
    if (!data || transfersWithFH.length === 0) return [];

    const realGroups = transfersWithFH.filter(
      (g) => (g.in && g.in.length) || (g.out && g.out.length)
    );

    return realGroups.flatMap((grp) => {
      const remainingIns = [...(grp.in || [])];

      const pairs = (grp.out || []).map((outP) => {
        const i = remainingIns.findIndex((inP) => inP.position === outP.position);
        const inP = i !== -1 ? remainingIns.splice(i, 1)[0] : null;
        return { outP, inP };
      });

      remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));

      return pairs
        .filter((x) => x.outP && x.inP)
        .map(({ outP, inP }) => ({
          gw: Number(grp.GW),
          position: outP.position,
          fromName: outP.Name || outP.name,
          toName: inP.Name || inP.name,
          toWebName: inP.web_name,
          toTeamCode: inP.team_code,
          toPhoto: inP.photo,
        }));
    });
  }, [data, transfersWithFH]);

  // Statistical payload
  const getStatisticalPlayersPayload = () => {
    if (!hasStatisticalData) return null;
    const arr = Playerdata?.current;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map((p) => ({
      ...p,
      calc_points: Number.isFinite(Number(p.calc_points)) ? Number(p.calc_points) : 0,
      Points: Number.isFinite(Number(p.calc_points)) ? Number(p.calc_points) : 0,
    }));
  };

  const handleOptimizeClick = () => {
    const useStatistical = modelType === "statistical" && hasStatisticalData;
    const playersPayload = useStatistical ? getStatisticalPlayersPayload() : null;

    fetchTeam({
      useStatisticalModel: useStatistical,
      playersData: playersPayload,
    });
    sethas_changed(false);
    setSaveError("");
    setSaveHint("");
  };

  const canSave =
    !!data &&
    Array.isArray(data) &&
    data.length > 0 &&
    typeof saveOptimization === "function";

  const normalizeName = (s) =>
    (s || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);

  const handleSaveOptimization = () => {
    setSaveError("");
    setSaveHint("");

    if (!canSave) {
      setSaveError("Run an optimization first.");
      return;
    }

    const trimmed = normalizeName(saveName);
    if (!trimmed) {
      setSaveError("Add a name (e.g. “Low risk · FH GW29”).");
      return;
    }

    const payload = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: trimmed,
      createdAt: Date.now(),
      snapshot: {
        params: {
          teamId: String(teamId || ""),
          bbRound: bbRound || "",
          wildRound: wildRound || "",
          freehitROund: freehitROund || "",
          bannedList: Array.isArray(bannedList) ? bannedList : [],
          n_hits: Number(n_hits || 0),
          risk: Number(risk || 0),
          valtrans: Number(valtrans || 0.5),
          modelType: modelType,
        },
        result: { data },
      },
    };

    saveOptimization(payload);
    setActiveSavedId(payload.id);
    setSaveName("");
    setSaveHint("Saved.");
    setTimeout(() => setSaveHint(""), 1400);
  };

  const runLabel = (opt) => {
    const created = opt?.createdAt ? new Date(opt.createdAt) : null;
    const ts = created
      ? created.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const mt = opt?.snapshot?.params?.modelType === "statistical" ? "Statistical" : "AI";
    return `${mt}${ts ? ` · ${ts}` : ""}`;
  };

  const activeChipsCount =
    (bbRound ? 1 : 0) + (wildRound ? 1 : 0) + (freehitROund ? 1 : 0);

  // Loading overlay
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          className="w-full max-w-md rounded-2xl p-5 shadow-2xl"
          style={{
            border: `1px solid ${PALETTE.gold}`,
            background: "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(0,0,0,0.9))",
          }}
        >
          <div className="mb-2 text-center text-sm" style={{ color: "#d1c3a9" }}>
            {loadingPhase === "fetch" ? "Fetching team…" : "Optimizing team…"}
          </div>
          <div className="h-2 w-full rounded bg-neutral-900 overflow-hidden">
            <div
              className="h-full transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%`, backgroundColor: PALETTE.gold }}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              role="progressbar"
            />
          </div>
          <div className="mt-3 text-center text-xs animate-pulse" style={{ color: "#9ca3af" }}>
            This can take a moment…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 45%, #000000 100%)`,
        color: PALETTE.beige,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Harden lucide SVG rendering even if global CSS overrides stroke */}
      <style>{`
        .lucide-icon {
          stroke: currentColor !important;
          fill: none !important;
          display: block;
          flex-shrink: 0;
        }
        summary::-webkit-details-marker { display:none; }
      `}</style>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-5 sm:mb-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Optimize My Team
            </h1>
            <p className="text-xs sm:text-sm mt-1" style={{ color: "#d1c3a9" }}>
              Configure chips and preferences, then run the optimizer.
            </p>
          </div>

          {totalPredPoints != null && (
            <div
              className="inline-flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{
                border: `1px solid rgba(248, 250, 252, 0.16)`,
                background: "rgba(0,0,0,0.55)",
              }}
            >
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                  Predicted points
                </div>
                <div className="text-lg font-bold" style={{ color: PALETTE.gold }}>
                  {totalPredPoints.toFixed(2)}
                </div>
              </div>
              <div className="h-9 w-px" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
              <div className="text-[11px]" style={{ color: "#9ca3af" }}>
                GW {minGW}–{maxGW} · {modelType === "ai" ? "AI" : "Statistical"}
              </div>
            </div>
          )}
        </header>

        {/* Saved Optimizations */}
        <section
          className="mb-6 rounded-2xl p-4 sm:p-6"
          style={{
            border: `1px solid ${PALETTE.gold}`,
            background: "linear-gradient(145deg, rgba(0,0,0,0.94), rgba(0,0,0,0.86))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.85)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold" style={{ color: PALETTE.gold }}>
                Saved optimizations
              </div>
              <div className="text-[11px]" style={{ color: "#9ca3af" }}>
                Click one to load it instantly.
              </div>
            </div>

          </div>

          <div className="mt-4">
            {typeof loadOptimization !== "function" || typeof deleteOptimization !== "function" ? (
              <div className="text-xs" style={{ color: "#fbbf24" }}>
                Missing context functions:{" "}
                <span className="font-semibold">loadOptimization</span> and/or{" "}
                <span className="font-semibold">deleteOptimization</span>.
              </div>
            ) : savedOptimizations.length === 0 ? (
              <div className="text-xs" style={{ color: "#9ca3af" }}>
                No saved optimizations yet.
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {savedOptimizations
                  .slice()
                  .sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0))
                  .map((opt) => {
                    const isActive = opt.id === activeSavedId;
                    return (
                      <div
                        key={opt.id}
                        className="flex items-center gap-2 rounded-full px-3 py-2 whitespace-nowrap"
                        style={{
                          border: isActive
                            ? `1px solid ${PALETTE.gold}`
                            : "1px solid rgba(248, 250, 252, 0.16)",
                          background: isActive
                            ? "rgba(184,134,11,0.14)"
                            : "rgba(0,0,0,0.55)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            loadOptimization(opt.id);
                            setActiveSavedId(opt.id);
                            setSaveError("");
                            setSaveHint("");
                          }}
                          className="text-left"
                          style={{ color: PALETTE.beige }}
                          title="Load this optimization"
                        >
                          <div className="text-sm font-semibold leading-none" style={{ color: "#cba108ff" }} >
                            {opt.name}
                          </div>
                          <div className="text-[10px] leading-none mt-1" style={{ color: "#873f0cff" }}>
                            {runLabel(opt)}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            deleteOptimization(opt.id);
                            if (activeSavedId === opt.id) setActiveSavedId(null);
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full transition"
                          style={{
                            border: "1px solid rgba(255,255,255,0.14)",
                            backgroundColor: "rgba(0,0,0,0.65)",
                            color: "#ef4444",
                          }}
                          aria-label={`Delete ${opt.name}`}
                          title="Delete"
                        >
                          <X size={16} className="lucide-icon" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </section>

        {/* Controls Card */}
        <section
          className="mb-6 rounded-2xl p-4 sm:p-6"
          style={{
            border: `1px solid ${PALETTE.gold}`,
            background: "linear-gradient(145deg, rgba(0,0,0,0.94), rgba(90,0,0,0.82))",
            boxShadow: "0 18px 40px rgba(0,0,0,0.85)",
          }}
        >
          <header className="mb-5 sm:mb-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
  <div>
    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
      Optimize My Team
    </h1>
    <p className="text-xs sm:text-sm mt-1" style={{ color: "#d1c3a9" }}>
      Configure chips and preferences, then run the optimizer.
    </p>
  </div>

  {/* Top-right Optimize */}
  <button
    onClick={handleOptimizeClick}
    disabled={!has_changed || !teamId}
    className="inline-flex items-center gap-2 font-semibold px-4 py-2 rounded-full transition"
    style={{
      border: `1px solid ${has_changed && teamId ? PALETTE.gold : "#374151"}`,
      background:
        has_changed && teamId
          ? `linear-gradient(135deg, ${PALETTE.gold}, #facc15)`
          : "rgba(0,0,0,0.55)",
      color: has_changed && teamId ? "#000000" : "#9ca3af",
      cursor: has_changed && teamId ? "pointer" : "not-allowed",
      boxShadow: has_changed && teamId ? "0 14px 28px rgba(0,0,0,0.55)" : "none",
    }}
    aria-disabled={!has_changed || !teamId}
  >
    Optimize
  </button>
</header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Team ID */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="team-id"
                className="text-xs uppercase tracking-wide"
                style={{ color: "#e5e7eb" }}
              >
                Team ID
              </label>
              <input
                id="team-id"
                type="number"
                inputMode="numeric"
                placeholder="Required"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl text-base sm:text-sm outline-none"
                style={{
                  fontSize: 16,
                  border: "1px solid rgba(248, 250, 252, 0.18)",
                  backgroundColor: "rgba(0,0,0,0.75)",
                  color: PALETTE.beige,
                }}
              />
            </div>

            {/* Chips */}
            <div className="flex flex-col gap-1 lg:col-span-3">
              <label className="text-xs uppercase tracking-wide" style={{ color: "#e5e7eb" }}>
                Chips
              </label>

              <details
                open={chipsOpen}
                onToggle={(e) => setChipsOpen(e.currentTarget.open)}
                className="rounded-xl"
                style={{
                  border: "1px solid rgba(248, 250, 252, 0.18)",
                  backgroundColor: "rgba(0,0,0,0.75)",
                }}
              >
                <summary
                  className="cursor-pointer select-none list-none flex items-center justify-between px-3 h-11"
                  style={{ color: PALETTE.gold }}
                >
                  <span>Add chips</span>
                  <span className="text-[11px]" style={{ color: "#9ca3af" }}>
                    {activeChipsCount} active
                  </span>
                </summary>

                <div className="p-3 pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ChipSelect
                    label="Bench Boost GW"
                    show={showBbInput}
                    onShow={() => {
                      setShowBbInput(true);
                      if (minGW != null) setBbRound(minGW);
                    }}
                    onHide={() => {
                      setShowBbInput(false);
                      setBbRound("");
                    }}
                    value={bbRound}
                    onChange={(v) => setBbRound(Number(v))}
                    minGW={minGW}
                    maxGW={maxGW}
                    addLabel="Add Bench Boost"
                  />

                  <ChipSelect
                    label="Wildcard GW"
                    show={showWildInput}
                    onShow={() => {
                      setShowWildInput(true);
                      if (minGW != null) setWildRound(minGW);
                    }}
                    onHide={() => {
                      setShowWildInput(false);
                      setWildRound("");
                    }}
                    value={wildRound}
                    onChange={(v) => setWildRound(Number(v))}
                    minGW={minGW}
                    maxGW={maxGW}
                    addLabel="Add Wildcard"
                  />

                  <ChipSelect
                    label="Free Hit GW"
                    show={showfreehitInput}
                    onShow={() => {
                      setshowfreehitInput(true);
                      if (minGW != null) setfreehitROund(minGW);
                    }}
                    onHide={() => {
                      setshowfreehitInput(false);
                      setfreehitROund("");
                    }}
                    value={freehitROund}
                    onChange={(v) => setfreehitROund(Number(v))}
                    minGW={minGW}
                    maxGW={maxGW}
                    addLabel="Add Free Hit"
                  />
                </div>
              </details>
            </div>

            {/* Hits */}
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide" style={{ color: "#e5e7eb" }}>
                Hits
              </label>
              <div
                className="h-11 rounded-xl flex items-center justify-between px-2"
                style={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(248, 250, 252, 0.18)",
                }}
              >
                <IconButton
                  ariaLabel="Decrease hits"
                  onClick={() => setn_hits(Math.max(0, Number(n_hits || 0) - 1))}
                  label="−"
                />
                <div className="flex flex-col items-center leading-none select-none">
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                    Count
                  </span>
                  <span className="text-sm font-semibold">{Number(n_hits || 0)}</span>
                </div>
                <IconButton
                  ariaLabel="Increase hits"
                  onClick={() => setn_hits(Number(n_hits || 0) + 1)}
                  label="+"
                />
              </div>
            </div>

            {/* Model */}
            <div className="flex flex-col gap-1 lg:col-span-2">
              <label className="text-xs uppercase tracking-wide" style={{ color: "#e5e7eb" }}>
                Model
              </label>
              <div className="flex items-center gap-2 h-11">
                <button
                  type="button"
                  onClick={() => setModelType("ai")}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs sm:text-sm border transition"
                  style={{
                    border:
                      modelType === "ai"
                        ? `1px solid ${PALETTE.gold}`
                        : "1px solid rgba(248, 250, 252, 0.18)",
                    background:
                      modelType === "ai"
                        ? `linear-gradient(135deg, ${PALETTE.gold}, #facc15)`
                        : "rgba(0,0,0,0.75)",
                    color: modelType === "ai" ? "#000000" : "#e5e7eb",
                  }}
                >
                  AI
                </button>

                <button
                  type="button"
                  onClick={() => hasStatisticalData && setModelType("statistical")}
                  disabled={!hasStatisticalData}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs sm:text-sm border transition"
                  style={{
                    border: !hasStatisticalData
                      ? "1px solid #4b5563"
                      : modelType === "statistical"
                      ? `1px solid ${PALETTE.gold}`
                      : "1px solid rgba(248, 250, 252, 0.18)",
                    background: !hasStatisticalData
                      ? "rgba(0,0,0,0.5)"
                      : modelType === "statistical"
                      ? `linear-gradient(135deg, ${PALETTE.gold}, #facc15)`
                      : "rgba(0,0,0,0.75)",
                    color: !hasStatisticalData
                      ? "#6b7280"
                      : modelType === "statistical"
                      ? "#000000"
                      : "#e5e7eb",
                    cursor: !hasStatisticalData ? "not-allowed" : "pointer",
                  }}
                >
                  Statistical
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate("/Adjustment_Analysis")}
                className="mt-2 text-[11px] inline-flex items-center gap-2 underline decoration-dotted"
                style={{ color: PALETTE.gold, alignSelf: "flex-start" }}
              >
                Open Your Statistical Model
                {!hasStatisticalData && (
                  <span style={{ color: "#fbbf24" }}>(needed to enable)</span>
                )}
              </button>
            </div>

            {/* Optimization params (WITH Optimize button moved here) */}
            <div className="flex flex-col gap-1 lg:col-span-4">
              <div className="flex items-end justify-between gap-3">
                <label className="text-xs uppercase tracking-wide" style={{ color: "#e5e7eb" }}>
                  Optimization params
                </label>

                
              </div>

              <details
                open={optParamsOpen}
                onToggle={(e) => setOptParamsOpen(e.currentTarget.open)}
                className="rounded-xl"
                style={{
                  border: "1px solid rgba(248, 250, 252, 0.18)",
                  backgroundColor: "rgba(0,0,0,0.75)",
                }}
              >
                <summary
                  className="cursor-pointer select-none list-none flex items-center justify-between px-3 h-12"
                  style={{ color: PALETTE.gold }}
                >
                  <span className="font-semibold">Adjust Optimization</span>
                  <span className="text-[10px]" style={{ color: "#9ca3af" }}>
                    {formatRiskLabel(risk)} · {formatValTransLabel(valtrans)}
                  </span>
                </summary>

                <div className="p-3 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Risk */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs uppercase tracking-wide" style={{ color: "#e5e7eb" }}>
                      Risk preference
                    </label>

                    <div className="flex items-center gap-2 mb-1">
                      <MiniPill active={Number(risk) === -0.6} onClick={() => setRisk(-0.6)}>
                        Low
                      </MiniPill>
                      <MiniPill active={Number(risk) === 0} onClick={() => setRisk(0)}>
                        Neutral
                      </MiniPill>
                      <MiniPill active={Number(risk) === 0.6} onClick={() => setRisk(0.6)}>
                        High
                      </MiniPill>
                    </div>

                    <div
                      className="h-12 rounded-xl px-3 flex items-center"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.8)",
                        border: "1px solid rgba(248, 250, 252, 0.18)",
                      }}
                    >
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.2}
                        value={clampRisk(Number(risk))}
                        onChange={(e) => setRisk(clampRisk(Number(e.target.value)))}
                        aria-label="Risk preference"
                        className="opt-range w-full appearance-none bg-transparent cursor-pointer"
                        style={{
                          WebkitAppearance: "none",
                          height: 6,
                          background: `linear-gradient(
                            to right,
                            ${PALETTE.gold} 0%,
                            ${PALETTE.gold} ${((Number(risk) + 1) / 2) * 100}%,
                            #374151 ${((Number(risk) + 1) / 2) * 100}%,
                            #374151 100%
                          )`,
                          borderRadius: 999,
                        }}
                      />
                    </div>

                    <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>
                      Low risk prefers stable picks. High risk rewards differentials.
                    </p>
                  </div>

                  {/* Value */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs uppercase tracking-wide" style={{ color: "#e5e7eb" }}>
                      Value of transfers
                    </label>

                    <div className="flex items-center gap-2 mb-1">
                      <MiniPill active={Number(valtrans) === 0} onClick={() => setValtrans(0)}>
                        Low
                      </MiniPill>
                      <MiniPill active={Number(valtrans) === 0.5} onClick={() => setValtrans(0.5)}>
                        Neutral
                      </MiniPill>
                      <MiniPill active={Number(valtrans) === 1} onClick={() => setValtrans(1)}>
                        High
                      </MiniPill>
                    </div>

                    <div
                      className="h-12 rounded-xl px-3 flex items-center"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.8)",
                        border: "1px solid rgba(248, 250, 252, 0.18)",
                      }}
                    >
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.25}
                        value={clampValTrans(Number(valtrans))}
                        onChange={(e) => setValtrans(clampValTrans(Number(e.target.value)))}
                        aria-label="Value of saved transfers"
                        className="opt-range w-full appearance-none bg-transparent cursor-pointer"
                        style={{
                          WebkitAppearance: "none",
                          height: 6,
                          background: `linear-gradient(
                            to right,
                            ${PALETTE.gold} 0%,
                            ${PALETTE.gold} ${Number(valtrans) * 100}%,
                            #374151 ${Number(valtrans) * 100}%,
                            #374151 100%
                          )`,
                          borderRadius: 999,
                        }}
                      />
                    </div>

                    <p className="text-[11px] mt-1" style={{ color: "#9ca3af" }}>
                      Higher value preserves transfers more.
                    </p>
                  </div>
                </div>

                <style>{`
                  .opt-range::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: ${PALETTE.gold};
                    border: 2px solid #000;
                    box-shadow: 0 0 0 2px rgba(184,134,11,0.35);
                    transition: transform 0.15s ease;
                  }
                  .opt-range::-webkit-slider-thumb:hover { transform: scale(1.12); }
                  .opt-range::-moz-range-thumb {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: ${PALETTE.gold};
                    border: 2px solid #000;
                    box-shadow: 0 0 0 2px rgba(184,134,11,0.35);
                  }
                  .opt-range::-moz-range-track {
                    height: 6px;
                    background: #374151;
                    border-radius: 999px;
                  }
                `}</style>
              </details>
            </div>
          </div>
        </section>

        {/* Unwanted players */}
        {bannedPlayersData.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Unwanted players</h2>
              <div className="text-[11px]" style={{ color: "#9ca3af" }}>
                Tap “X” on a player to add/remove.
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {bannedPlayersData.map((player) => (
                <div
                  key={player.Name}
                  className="relative flex items-center gap-2 px-2 py-1 rounded-full text-sm transition"
                  style={{
                    backgroundColor: "rgba(248, 113, 113, 0.12)",
                    border: "1px solid rgba(248, 113, 113, 0.3)",
                    color: "#fee2e2",
                  }}
                >
                  <img
                    src={player.photo}
                    alt={player.web_name}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src =
                        "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
                    }}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                  <span className="truncate max-w-[8rem]">{player.web_name}</span>
                  <button
                    onClick={() => removeBan(player.Name)}
                    className="absolute -top-1 -right-1 rounded-full p-0.5"
                    style={{ backgroundColor: "rgba(0,0,0,0.7)", color: "#fff" }}
                    aria-label={`Remove ${player.web_name} from unwanted`}
                  >
                    <X size={12} className="lucide-icon" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Save bar above pitch */}
        <section className="mb-3 flex justify-center">
          <div
            className="w-full max-w-[420px] rounded-2xl p-3 sm:p-4"
            style={{
              border: `1px solid rgba(248, 250, 252, 0.16)`,
              background: "rgba(0,0,0,0.72)",
              boxShadow: "0 14px 26px rgba(0,0,0,0.65)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                  Save this run
                </div>
                <div className="text-sm font-semibold" style={{ color: PALETTE.beige }}>
                  Optimization name
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveOptimization}
                disabled={!canSave}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full font-semibold transition"
                style={{
                  border: `1px solid ${canSave ? PALETTE.gold : "#374151"}`,
                  background: canSave
                    ? `linear-gradient(135deg, ${PALETTE.gold}, #facc15)`
                    : "rgba(0,0,0,0.55)",
                  color: canSave ? "#000" : "#9ca3af",
                  cursor: canSave ? "pointer" : "not-allowed",
                  boxShadow: canSave ? "0 10px 18px rgba(0,0,0,0.45)" : "none",
                }}
              >
                <BookmarkPlus size={16} className="lucide-icon" />
                Save
              </button>
            </div>

            <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={canSave ? "e.g. Low risk · FH GW29" : "Run optimization to enable saving"}
                disabled={!canSave}
                className="h-11 w-full px-3 rounded-xl text-sm outline-none"
                style={{
                  fontSize: 16,
                  border: `1px solid ${
                    saveError ? "rgba(248,113,113,0.6)" : "rgba(248, 250, 252, 0.16)"
                  }`,
                  backgroundColor: !canSave ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.78)",
                  color: PALETTE.beige,
                }}
              />

              <div
                className="text-[11px] sm:text-xs"
                style={{ color: saveError ? "#fbbf24" : "#9ca3af" }}
              >
                {saveError ? saveError : saveHint ? saveHint : "Saved locally and listed above."}
              </div>
            </div>
          </div>
        </section>

        {/* Pitch */}
        {data && (
          <section className="mb-3 flex justify-center">
            <div
              className="w-full max-w-[420px] aspect-[1/2] bg-no-repeat bg-cover bg-center rounded-2xl px-2 py-1 relative"
              style={{
                backgroundImage: `url(${pitch})`,
                border: "1px solid rgba(255,255,255,0.16)",
                boxShadow: "0 18px 40px rgba(0,0,0,0.75)",
              }}
            >
              <div className="flex flex-col justify-between h-[480px] pt-0 space-y-0 width-full">
                <PlayerRow
                  players={starters.filter((p) => p.position === "GKP")}
                  toggleBan={toggleBan}
                  bannedList={bannedList}
                  navigate={navigate}
                />
                <PlayerRow
                  players={starters.filter((p) => p.position === "DEF")}
                  toggleBan={toggleBan}
                  bannedList={bannedList}
                  navigate={navigate}
                />
                <PlayerRow
                  players={starters.filter((p) => p.position === "MID")}
                  toggleBan={toggleBan}
                  bannedList={bannedList}
                  navigate={navigate}
                />
                <PlayerRow
                  players={starters.filter((p) => p.position === "FWD")}
                  toggleBan={toggleBan}
                  bannedList={bannedList}
                  navigate={navigate}
                />
              </div>
              {bench.length > 0 && (
                <div className="absolute bottom-4 left-0 right-0">
                  <PlayerRow
                    players={bench}
                    isBench
                    toggleBan={toggleBan}
                    bannedList={bannedList}
                    navigate={navigate}
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Apply transfers */}
        {data && (
          <section className="mb-6 flex flex-col items-center gap-3 mt-10">
            <button
              type="button"
              onClick={handleApplyToPlanner}
              disabled={!plannerPayload.length}
              className="inline-flex items-center gap-2 font-semibold px-6 py-2 rounded-full transition shadow-lg"
              style={{
                border: `1px solid ${plannerPayload.length ? PALETTE.gold : "#374151"}`,
                background: plannerPayload.length
                  ? `linear-gradient(135deg, ${PALETTE.gold}, #facc15)`
                  : "rgba(0,0,0,0.7)",
                color: plannerPayload.length ? "#000000" : "#9ca3af",
                cursor: plannerPayload.length ? "pointer" : "not-allowed",
              }}
            >
              <Search size={18} className="lucide-icon" />
              See transfers on My Team
            </button>

            {!plannerPayload.length && (
              <div className="text-xs" style={{ color: "#9ca3af" }}>
                Run an optimization with transfers first.
              </div>
            )}
          </section>
        )}

        {/* Transfers */}
        {transfersWithFH.length > 0 && (
          <section className="mb-4">
            <h2 className="text-2xl font-bold text-center mb-4">Transfers</h2>
            <div className="space-y-6">
              {transfersWithFH.map((grp) => {
                const remainingIns = [...grp.in];
                const pairs = grp.out.map((outP) => {
                  const i = remainingIns.findIndex((inP) => inP.position === outP.position);
                  return i !== -1
                    ? { outP, inP: remainingIns.splice(i, 1)[0] }
                    : { outP, inP: null };
                });
                remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));

                return (
                  <div
                    key={grp.GW}
                    className="rounded-2xl p-4"
                    style={{
                      border: `1px solid ${PALETTE.gold}`,
                      background: "linear-gradient(145deg, rgba(0,0,0,0.94), rgba(0,0,0,0.86))",
                      boxShadow: "0 18px 40px rgba(0,0,0,0.85)",
                    }}
                  >
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <div className="text-sm font-medium">GW {grp.GW}</div>
                      {grp.freehit && (
                        <span
                          className="text-xs px-2 py-1 rounded-full"
                          style={{
                            border: `1px solid ${PALETTE.gold}`,
                            color: PALETTE.gold,
                            backgroundColor: "rgba(0,0,0,0.7)",
                          }}
                        >
                          Played Free Hit
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap justify-center items-center gap-6">
                      {pairs.map(({ outP, inP }, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {outP && (
                            <TransferCard
                              player={outP}
                              label="Out"
                              toggleBan={toggleBan}
                              bannedList={bannedList}
                              navigate={navigate}
                            />
                          )}
                          {outP && inP && (
                            <ArrowRight size={18} className="lucide-icon" style={{ color: PALETTE.gold }} />
                          )}
                          {inP && (
                            <TransferCard
                              player={inP}
                              label="In"
                              toggleBan={toggleBan}
                              bannedList={bannedList}
                              navigate={navigate}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Components **/
function ChipSelect({ label, show, onShow, onHide, value, onChange, minGW, maxGW, addLabel }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-wide" style={{ color: "#e5e7eb" }}>
        {label}
      </label>

      {show ? (
        <div className="relative">
          <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            style={{ colorScheme: "dark" }}
            className="w-full h-11 pl-3 pr-9 rounded-xl text-sm outline-none"
            aria-label={label}
          >
            <option value="" disabled className="text-neutral-400">
              {label}
            </option>
            {Array.from({ length: maxGW - minGW + 1 }, (_, i) => minGW + i).map((gw) => (
              <option key={gw} value={gw}>
                GW {gw}
              </option>
            ))}
          </select>

          <button
            onClick={onHide}
            className="absolute inset-y-0 right-0 px-3 flex items-center"
            style={{ color: "#f87171" }}
            aria-label={`Clear ${label}`}
            type="button"
          >
            <X size={16} className="lucide-icon" />
          </button>
        </div>
      ) : (
        <button
          onClick={onShow}
          type="button"
          className="h-11 w-full inline-flex items-center justify-center rounded-xl text-sm"
          style={{
            border: `1px dashed ${PALETTE.gold}`,
            backgroundColor: "rgba(0,0,0,0.8)",
            color: PALETTE.gold,
          }}
        >
          + {addLabel}
        </button>
      )}
    </div>
  );
}

function IconButton({ ariaLabel, onClick, label }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm leading-none"
      style={{
        border: `1px solid rgba(248, 250, 252, 0.18)`,
        backgroundColor: "rgba(0,0,0,0.8)",
        color: PALETTE.gold,
      }}
    >
      {label}
    </button>
  );
}

function MiniPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 text-[11px] font-semibold transition rounded-full"
      style={{
        border: `1px solid ${PALETTE.gold}`,
        background: active ? `linear-gradient(135deg, ${PALETTE.gold}, #facc15)` : "rgba(0,0,0,0.65)",
        color: active ? "#000" : PALETTE.gold,
      }}
    >
      {children}
    </button>
  );
}

function PlayerRow({ players, isBench = false, toggleBan, bannedList, navigate }) {
  const fallback =
    "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";

  const positionOrder = ["GKP", "DEF", "MID", "FWD"];

  const sortedPlayers = isBench
    ? [...players].sort(
        (a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position)
      )
    : players;

  return (
    <div className="flex justify-center gap-2 px-1 overflow-x-auto text-center w-full">
      {sortedPlayers.map((p) => (
        <div key={p.Name} className="relative">
          {p.Is_captain && (
            <div className="absolute top-5 -left-2 bg-black/80 text-white font-bold text-xs rounded-full w-5 h-5 flex items-center justify-center shadow">
              C
            </div>
          )}
          <img
            src={p.photo}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = fallback;
            }}
            className={`${
              isBench ? "w-[50px] h-[60px] sm:w-[56px] sm:h-[76px]" : "w-[55px] h-[70px] sm:w-[62px] sm:h-[86px]"
            } object-contain drop-shadow`}
            onClick={() =>
              navigate("/Player_Analytics/Individual", { state: { selectedPlayer: p.Name } })
            }
            alt={p.web_name}
            role="button"
          />
          <button
            onClick={() => toggleBan(p.Name)}
            className="absolute top-1 -right-2 bg-black/70 p-1 rounded-full hover:bg-black/90"
            aria-label={`Toggle unwanted for ${p.web_name}`}
          >
            <X size={12} className="lucide-icon" style={{ color: bannedList.includes(p.Name) ? "#fb7185" : PALETTE.gold }} />
          </button>
          <div className="mt-1 text-[11px] sm:text-xs leading-tight max-w-[70px] truncate bg-gray-100/90 rounded-full text-black/95">
            {p.web_name}
          </div>
        </div>
      ))}
    </div>
  );
}

function TransferCard({ player, label, toggleBan, bannedList, navigate }) {
  const fallback = "https://cdn.nba.com/headshots/nba/latest/1040x760/1709.png";
  return (
    <div className="flex flex-col items-center text-neutral-100">
      <div className="relative">
        <img
          src={player.photo}
          alt={player.Name}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = fallback;
          }}
          className="w-12 h-16 rounded object-cover border border-white/10 shadow"
          onClick={() =>
            navigate("/Player_Analytics/Individual", { state: { selectedPlayer: player.Name } })
          }
          role="button"
        />
        {label === "In" && (
          <button
            onClick={() => toggleBan(player.Name)}
            className="absolute -top-2 -right-4 bg-black/70 p-1 rounded-full hover:bg-black/90"
            aria-label={`Toggle unwanted for ${player.web_name}`}
          >
            <X size={14} className="lucide-icon" style={{ color: bannedList.includes(player.Name) ? "#fb7185" : PALETTE.gold }} />
          </button>
        )}
      </div>
      <span className="text-xs mt-1 max-w-[80px] truncate text-center">{player.web_name}</span>
      <span className="text-[11px] text-neutral-400">{label}</span>
    </div>
  );
}