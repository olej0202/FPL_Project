import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  X,
  ArrowRight,
  Search,
  BookmarkPlus,
  Sparkles,
  Shield,
  Trophy,
  Brain,
  SlidersHorizontal,
  Save,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  Target,
  Wand2,
  PencilLine,
  RefreshCw,
  Ban,
  CheckCircle2,
  CircleDashed,
  Zap,
  Lock,
} from "lucide-react";
import pitch from "./assets/Pitch4.png";
import { useMyteamData } from "./Contexts/MyTeamContext";
import { useAdjustmentData } from "./Contexts/AdjustmentsContext";

const PALETTE = {
  red: "#f8fafc",
  gold: "#5f8f7b",
  goldSoft: "#8fbca9",
  black: "#e2e8f0",
  beige: "#1e293b",
  panel: "rgba(255,255,255,0.95)",
  panelStrong: "rgba(248,250,252,0.98)",
  border: "rgba(148,163,184,0.35)",
  muted: "#64748b",
  success: "#16a34a",
  danger: "#ef4444",
  text: "#0f172a",
};

const isValidGW = (gw) =>
  Number.isInteger(gw) && gw >= 1 && gw <= 38;

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
  const location = useLocation();

  const [modelType, setModelType] = useState("ai");
  const [optParamsOpen, setOptParamsOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveHint, setSaveHint] = useState("");
  const [activeSavedId, setActiveSavedId] = useState(null);
  const [showBbInput, setShowBbInput] = useState(!!bbRound);
  const [showWildInput, setShowWildInput] = useState(!!wildRound);
  const [showfreehitInput, setshowfreehitInput] = useState(!!freehitROund);
  const [chipsOpen, setChipsOpen] = useState(!!bbRound || !!wildRound || !!freehitROund);
  const [loadingPhase, setLoadingPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [savedOpen, setSavedOpen] = useState(true);
  const [selectedGW, setSelectedGW] = useState(null);
  const pitchSectionRef = useRef(null);
  const preferredModelAppliedRef = useRef(false);

  const hasStatisticalData = useMemo(() => {
    const arr = Playerdata?.current;
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.some((p) => p && p.calc_points != null && Number.isFinite(Number(p.calc_points)));
  }, [Playerdata, dataVersion]);

  const clampRisk = (v) => Math.max(-1, Math.min(1, v));
  const clampValTrans = (v) => Math.max(0, Math.min(1, v));

  const formatRiskLabel = (v) => {
    const n = Number(v);
    if (n <= -0.3) return "Low risk";
    if (n >= 0.3) return "High risk";
    return "Neutral";
  };

  const formatValTransLabel = (v) => {
    const n = Number(v);
    if (n <= 0.1) return "Low value";
    if (n >= 0.9) return "High value";
    return "Neutral";
  };

  useEffect(() => {
    if (modelType === "statistical" && !hasStatisticalData) {
      setModelType("ai");
    }
  }, [modelType, hasStatisticalData]);

  useEffect(() => {
    const shouldPreferStat = location.state?.preferModel === "statistical";
    if (!shouldPreferStat || preferredModelAppliedRef.current) return;

    if (hasStatisticalData) {
      setModelType("statistical");
      preferredModelAppliedRef.current = true;
    }
  }, [location.state, hasStatisticalData]);

  useEffect(() => {
    sethas_changed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, bbRound, wildRound, bannedList, freehitROund, n_hits, modelType, risk, valtrans]);

  useEffect(() => {
    if (loading) {
      setLoadingPhase("fetch");
      setProgress(0);

      let rafId;
      let iv;
      const start = performance.now();
      const duration = 2600;

      const tick = (now) => {
        const elapsed = now - start;
        const pct = Math.min(42, (elapsed / duration) * 42);
        setProgress(pct);

        if (elapsed < duration && loading) {
          rafId = requestAnimationFrame(tick);
        } else if (loading) {
          setLoadingPhase("optimize");
          let p = Math.max(pct, 42);
          iv = setInterval(() => {
            if (!loading) return clearInterval(iv);
            p = Math.min(97, p + 1.1);
            setProgress(p);
            if (p >= 97) clearInterval(iv);
          }, 180);
        }
      };

      rafId = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(rafId);
        clearInterval(iv);
      };
    }

    setProgress(100);
    const t = setTimeout(() => setProgress(0), 320);
    setLoadingPhase("idle");
    return () => clearTimeout(t);
  }, [loading]);

  const availableGWs = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];

    return Array.from(
      new Set(
        data
          .map((p) => Number(p.GW))
          .filter((n) => isValidGW(n))
      )
    ).sort((a, b) => a - b);
  }, [data]);

  useEffect(() => {
    if (!availableGWs.length) {
      setSelectedGW(null);
      return;
    }

    setSelectedGW((prev) => {
      if (Number.isFinite(prev) && availableGWs.includes(prev)) return prev;
      return availableGWs[0];
    });
  }, [availableGWs]);

  const activeGW =
    Number.isFinite(selectedGW) && availableGWs.includes(selectedGW)
      ? selectedGW
      : availableGWs[0] ?? null;
  const activeGWIndex = availableGWs.indexOf(activeGW);
  const canGoPrevGW = activeGWIndex > 0;
  const canGoNextGW = activeGWIndex >= 0 && activeGWIndex < availableGWs.length - 1;

  let minGW = 1;
  let maxGW = 38;
  let starters = [];
  let bench = [];
  let transfers = [];
  let gwData = [];

  if (data) {
    if (availableGWs.length) {
      minGW = availableGWs[0];
      maxGW = availableGWs[availableGWs.length - 1];
    }

    gwData = data.filter((p) => Number(p.GW) === activeGW);
    starters = gwData.filter((p) => p.status === "playing");
    bench = gwData.filter((p) => p.status === "benched");

    const moves = data.filter((p) => {
      const gw = Number(p.GW);
      return ["transferred_in", "transferred_out"].includes(p.status) && isValidGW(gw);
    });
    transfers = Object.values(
      moves.reduce((acc, curr) => {
        const gw = Number(curr.GW);
        if (!isValidGW(gw)) return acc;
        if (!acc[gw]) acc[gw] = { GW: gw, in: [], out: [] };
        acc[gw][curr.status === "transferred_in" ? "in" : "out"].push(curr);
        return acc;
      }, {})
    ).sort((a, b) => Number(a.GW) - Number(b.GW));
  }

  let totalPredPoints = null;
  if (data) {
    const objRow =
      data.find((p) => p.Name === "Obj Value") ||
      gwData.find((p) => p.Name === "Obj Value") ||
      data.find((p) => p.Name === "__TOTAL_OBJECTIVE__");

    if (objRow) {
      const asNum = objRow.objective != null ? Number(objRow.objective) : Number(objRow.status);
      totalPredPoints = Number.isFinite(asNum) ? asNum : null;
    }
  }

  const toNum = (v) => Number(v);
  let transfersWithFH = transfers;

  if (data && Number.isFinite(minGW) && Number.isFinite(maxGW)) {
    const fhGW = Number(freehitROund);
    const fhActive = isValidGW(fhGW) && fhGW >= minGW && fhGW <= maxGW;

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

  const plannerPayload = useMemo(() => {
    if (!data || transfersWithFH.length === 0) return [];

    const realGroups = transfersWithFH.filter((g) => (g.in && g.in.length) || (g.out && g.out.length));

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

  const handleApplyToPlanner = () => {
    if (!plannerPayload.length) return;
    navigate("/Team_Overview", {
      state: { optimizedTransfers: plannerPayload, applyId: Date.now() },
    });
  };

  const canSave = !!data && Array.isArray(data) && data.length > 0 && typeof saveOptimization === "function";

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
      setSaveError("Add a name like ‘Low risk · FH GW29’.");
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
          modelType,
        },
        result: {
          data,
          bannedPlayersData: Array.isArray(bannedPlayersData) ? bannedPlayersData : [],
        },
      },
    };

    saveOptimization(payload);
    setActiveSavedId(payload.id);
    setSaveName("");
    setSaveHint("Saved successfully.");
    setTimeout(() => setSaveHint(""), 1500);
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

  const activeChipsCount = (bbRound ? 1 : 0) + (wildRound ? 1 : 0) + (freehitROund ? 1 : 0);
  const totalTransfers = plannerPayload.length;

  useEffect(() => {
    if (!loading && data && typeof window !== "undefined" && window.innerWidth < 640) {
      const t = setTimeout(() => {
        pitchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 180);
      return () => clearTimeout(t);
    }
  }, [loading, data]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background: `radial-gradient(circle at top, ${PALETTE.red}, ${PALETTE.black})`,
          color: PALETTE.beige,
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          className="w-full max-w-md rounded-[28px] p-6 shadow-2xl"
          style={{
            border: `1px solid ${PALETTE.gold}`,
            background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,255,255,0.95))",
            boxShadow: "0 25px 50px rgba(15,23,42,0.12)",
          }}
        >
          <div className="flex items-center justify-center mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center animate-pulse"
              style={{
                background: "rgba(95,143,123,0.12)",
                border: `1px solid rgba(95,143,123,0.45)`,
              }}
            >
              <RefreshCw size={24} className="lucide-icon animate-spin" style={{ color: PALETTE.gold }} />
            </div>
          </div>

          <div className="mb-2 text-center text-sm font-medium" style={{ color: PALETTE.muted }}>
            {loadingPhase === "fetch" ? "Fetching your team data" : "Building the optimal plan"}
          </div>
          <div className="mb-4 text-center text-xs" style={{ color: PALETTE.muted }}>
            Evaluating chips, transfers, and projected outcomes.
          </div>

          <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full transition-[width] duration-200 ease-out rounded-full"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`,
              }}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              role="progressbar"
            />
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px]" style={{ color: PALETTE.muted }}>
            <span>{loadingPhase === "fetch" ? "Step 1 of 2" : "Step 2 of 2"}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(circle at top, ${PALETTE.red} 0, ${PALETTE.black} 52%, #cbd5e1 100%)`,
        color: PALETTE.beige,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        .lucide-icon {
          stroke: currentColor !important;
          fill: none !important;
          display: block;
          flex-shrink: 0;
        }
        summary::-webkit-details-marker { display: none; }
        .glass-card {
          border: 1px solid ${PALETTE.border};
          background: linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.95));
          box-shadow: 0 18px 40px rgba(15,23,42,0.1);
          backdrop-filter: blur(12px);
        }
        .gold-ring:focus-visible {
          outline: 2px solid ${PALETTE.gold};
          outline-offset: 2px;
        }
        .opt-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: ${PALETTE.gold};
          border: 2px solid #e2e8f0;
          box-shadow: 0 0 0 2px rgba(95,143,123,0.35);
          transition: transform .15s ease;
        }
        .opt-range::-webkit-slider-thumb:hover { transform: scale(1.08); }
        .opt-range::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: ${PALETTE.gold};
          border: 2px solid #e2e8f0;
          box-shadow: 0 0 0 2px rgba(95,143,123,0.35);
        }
        .opt-range::-moz-range-track {
          height: 6px;
          background: #cbd5e1;
          border-radius: 999px;
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3 text-[11px] uppercase tracking-[0.18em]"
              style={{
                color: PALETTE.gold,
                border: `1px solid rgba(95,143,123,0.35)`,
                background: "rgba(95,143,123,0.08)",
              }}
            >
              <Sparkles size={14} className="lucide-icon" />
              Optimization Workspace
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: PALETTE.text }}>
              Optimize My Team
            </h1>
            <p className="text-sm mt-2 max-w-2xl" style={{ color: PALETTE.muted }}>
              Build a cleaner transfer plan, compare AI vs statistical logic, and move the best recommendations straight into your planner.
            </p>
          </div>
          <button
            onClick={handleOptimizeClick}
            disabled={!has_changed || !teamId}
            className="green-ring inline-flex items-center justify-center gap-2 font-semibold px-4 py-3 rounded-2xl transition-all"
            style={{
              border: `1px solid ${has_changed && teamId ? PALETTE.gold : PALETTE.border}`,
              background: has_changed && teamId
                ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                : "rgba(248,250,252,0.9)",
              color: has_changed && teamId ? "#0f172a" : PALETTE.muted,
              cursor: has_changed && teamId ? "pointer" : "not-allowed",
              boxShadow: has_changed && teamId ? "0 12px 24px rgba(15,23,42,0.12)" : "none",
            }}
          >


            <Wand2 size={17} className="lucide-icon" />
            Optimize now
          </button>
        </header>

        <section className="mb-6 grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
          <div className="glass-card rounded-[28px] p-4 sm:p-6">
            <button
              type="button"
              onClick={() => setControlsOpen((v) => !v)}
              className="gold-ring w-full flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between text-left rounded-2xl px-3 py-3" style={{ background: "rgba(248,250,252,0.9)", border: `1px solid ${PALETTE.border}` }}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.gold }}>
                  <SlidersHorizontal size={16} className="lucide-icon" />
                  Optimization controls
                </div>
                <p className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                  Tune your team ID, chips, model, and optimization profile.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 self-start sm:self-center" style={{ color: PALETTE.muted }}>
                <span className="text-xs">{controlsOpen ? "Minimize" : "Expand"}</span>
                {controlsOpen ? <ChevronDown size={18} className="lucide-icon" /> : <ChevronRight size={18} className="lucide-icon" />}
              </div>
            </button>

            {controlsOpen && (
              <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mt-4">
              <div className="hidden sm:block" />

            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-start">
              <FieldShell label="Team ID" icon={Users} className="min-w-0 md:col-span-1 xl:col-span-3">
                <input
                  id="team-id"
                  type="number"
                  inputMode="numeric"
                  placeholder="Required"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="gold-ring w-full h-12 px-3 rounded-2xl text-base sm:text-sm outline-none"
                  style={{
                    fontSize: 16,
                    border: `1px solid ${PALETTE.border}`,
                    backgroundColor: "rgba(248,250,252,0.92)",
                    color: PALETTE.beige,
                  }}
                />
              </FieldShell>

              

              <FieldShell label="Model" icon={Brain} className="min-w-0 md:col-span-2 xl:col-span-7">
                <div className="grid grid-cols-2 gap-2">
                  <ModelButton active={modelType === "ai"} onClick={() => setModelType("ai")} icon={Sparkles}>
                    AI model
                  </ModelButton>
                  <ModelButton
                    active={modelType === "statistical"}
                    onClick={() => hasStatisticalData && setModelType("statistical")}
                    disabled={!hasStatisticalData}
                    icon={Trophy}
                  >
                    Statistical
                  </ModelButton>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/Adjustment_Analysis/Adjustment_Player")}
                  className="gold-ring mt-2 text-[11px] inline-flex items-center gap-2 underline decoration-dotted"
                  style={{ color: PALETTE.gold, alignSelf: "flex-start" }}
                >
                  <PencilLine size={13} className="lucide-icon" />
                  Edit player stats
                  {!hasStatisticalData && <span style={{ color: "#fbbf24" }}>(required to enable)</span>}
                </button>
              </FieldShell>
            </div>
            <FieldShell label="Force Hits" icon={Shield} className="min-w-0 md:col-span-1 xl:col-span-2 mt-3">
                <div
                  className="h-12 min-w-0 rounded-2xl flex items-center justify-between px-2 gap-2"
                  style={{ backgroundColor: "rgba(248,250,252,0.95)", border: `1px solid ${PALETTE.border}` }}
                >
                  <IconButton ariaLabel="Decrease hits" onClick={() => setn_hits(Math.max(0, Number(n_hits || 0) - 1))} label="−" />
                  <div className="flex flex-col items-center leading-none select-none">
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Count</span>
                    <span className="text-sm font-semibold">{Number(n_hits || 0)}</span>
                  </div>
                  <IconButton ariaLabel="Increase hits" onClick={() => setn_hits(Number(n_hits || 0) + 1)} label="+" />
                </div>
              </FieldShell>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <details
                open={chipsOpen}
                onToggle={(e) => setChipsOpen(e.currentTarget.open)}
                className="rounded-[24px] overflow-hidden min-w-0"
                style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.88)" }}
              >
                <summary className="cursor-pointer select-none list-none flex items-center justify-between px-4 h-14">
                  <div className="flex items-center gap-2" style={{ color: PALETTE.gold }}>
                    <CalendarRange size={16} className="lucide-icon" />
                    <span className="font-semibold">Chip strategy</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: PALETTE.muted }}>
                    <span>{activeChipsCount} active</span>
                    {chipsOpen ? <ChevronDown size={14} className="lucide-icon" /> : <ChevronRight size={14} className="lucide-icon" />}
                  </div>
                </summary>

                <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
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
                    icon={Shield}
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
                    icon={RefreshCw}
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
                    icon={Zap}
                  />
                </div>
              </details>

              <details
                open={optParamsOpen}
                onToggle={(e) => setOptParamsOpen(e.currentTarget.open)}
                className="rounded-[24px] overflow-hidden min-w-0"
                style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.88)" }}
              >
                <summary className="cursor-pointer select-none list-none flex items-center justify-between px-4 h-14">
                  <div className="flex items-center gap-2" style={{ color: PALETTE.gold }}>
                    <SlidersHorizontal size={16} className="lucide-icon" />
                    <span className="font-semibold">Optimization settings</span>
                  </div>
    
                </summary>

                <div className="px-4 pb-4 grid grid-cols-1 gap-4">
                  <PreferenceSlider
                    title="Risk preference"
                    icon={Shield}
                    value={risk}
                    setValue={setRisk}
                    min={-1}
                    max={1}
                    step={0.2}
                    clamp={clampRisk}
                    presets={[
                      { label: "Low", value: -0.6 },
                      { label: "Neutral", value: 0 },
                      { label: "High", value: 0.6 },
                    ]}
                    description="Low risk prefers stable picks. High risk rewards differentials."
                    fillPercent={((Number(risk) + 1) / 2) * 100}
                  />

                  <PreferenceSlider
                    title="Transfer value"
                    icon={Lock}
                    value={valtrans}
                    setValue={setValtrans}
                    min={0}
                    max={1}
                    step={0.25}
                    clamp={clampValTrans}
                    presets={[
                      { label: "Low", value: 0 },
                      { label: "Neutral", value: 0.5 },
                      { label: "High", value: 1 },
                    ]}
                    description="Higher value preserves transfers more."
                    fillPercent={Number(valtrans) * 100}
                  />
                </div>
              </details>
            </div>
            </>
            )}
          </div>

          <div className="glass-card rounded-[28px] p-4 sm:p-6">
            <button
              type="button"
              onClick={() => setSavedOpen((v) => !v)}
              className="gold-ring w-full flex items-start justify-between gap-3 text-left rounded-2xl px-3 py-3" style={{ background: "rgba(248,250,252,0.9)", border: `1px solid ${PALETTE.border}` }}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.gold }}>
                  <Save size={16} className="lucide-icon" />
                  Saved optimizations
                </div>
                <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                  Save strong runs and reload them instantly.
                </div>
              </div>
              <div className="inline-flex items-center gap-2 self-start sm:self-center" style={{ color: PALETTE.muted }}>
                <span className="text-xs">{savedOpen ? "Minimize" : "Expand"}</span>
                {savedOpen ? <ChevronDown size={18} className="lucide-icon" /> : <ChevronRight size={18} className="lucide-icon" />}
              </div>
            </button>

            {savedOpen && (
            <>
            <div className="mt-4 rounded-[24px] p-4" style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.9)" }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>
                    Save this run
                  </div>
                  <div className="text-sm font-semibold">Optimization name</div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveOptimization}
                  disabled={!canSave}
                  className="gold-ring inline-flex items-center gap-2 px-3 py-2 rounded-full font-semibold transition"
                  style={{
                    border: `1px solid ${canSave ? PALETTE.gold : "#cbd5e1"}`,
                    background: canSave ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "rgba(248,250,252,0.9)",
                    color: canSave ? "#0f172a" : PALETTE.muted,
                    cursor: canSave ? "pointer" : "not-allowed",
                  }}
                >
                  <BookmarkPlus size={16} className="lucide-icon" />
                  Save
                </button>
              </div>

              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={canSave ? "e.g. Low risk · FH GW29" : "Run optimization to enable saving"}
                disabled={!canSave}
                className="gold-ring mt-3 h-12 w-full px-3 rounded-2xl text-sm outline-none"
                style={{
                  fontSize: 16,
                  border: `1px solid ${saveError ? "rgba(248,113,113,0.6)" : PALETTE.border}`,
                  backgroundColor: !canSave ? "rgba(248,250,252,0.84)" : "rgba(248,250,252,0.94)",
                  color: PALETTE.beige,
                }}
              />

              {(saveError || saveHint) && (
                <div className="mt-2 text-xs inline-flex items-center gap-2" style={{ color: saveError ? "#fbbf24" : PALETTE.success }}>
                  {saveError ? <CircleDashed size={14} className="lucide-icon" /> : <CheckCircle2 size={14} className="lucide-icon" />}
                  {saveError || saveHint}
                </div>
              )}
            </div>

            <div className="mt-4">
              {typeof loadOptimization !== "function" || typeof deleteOptimization !== "function" ? (
                <div className="text-xs rounded-2xl p-4" style={{ color: "#fbbf24", border: `1px solid rgba(251,191,36,0.25)`, background: "rgba(251,191,36,0.06)" }}>
                  Missing context functions: <span className="font-semibold">loadOptimization</span> and/or <span className="font-semibold">deleteOptimization</span>.
                </div>
              ) : savedOptimizations.length === 0 ? (
                <div className="rounded-2xl p-6 text-center" style={{ border: `1px dashed ${PALETTE.border}`, background: "rgba(248,250,252,0.76)" }}>
                  <Save size={24} className="lucide-icon mx-auto mb-2" style={{ color: PALETTE.gold }} />
                  <div className="text-sm font-semibold">No saved optimizations yet</div>
                  <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                    Run an optimization and save it for quick comparisons.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                  {savedOptimizations
                    .slice()
                    .sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0))
                    .map((opt) => {
                      const isActive = opt.id === activeSavedId;
                      return (
                        <div
                          key={opt.id}
                          className="rounded-2xl p-3 flex items-center justify-between gap-3 transition"
                          style={{
                            border: isActive ? `1px solid ${PALETTE.gold}` : `1px solid ${PALETTE.border}`,
                            background: isActive ? "rgba(95,143,123,0.10)" : "rgba(248,250,252,0.8)",
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
                            className="gold-ring text-left flex-1"
                            title="Load this optimization"
                            style={{ color: PALETTE.beige }}
                          >
                            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PALETTE.goldSoft }}>
                              <Sparkles size={14} className="lucide-icon" />
                              {opt.name}
                            </div>
                            <div className="text-[11px] mt-1" style={{ color: PALETTE.muted }}>
                              {runLabel(opt)}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              deleteOptimization(opt.id);
                              if (activeSavedId === opt.id) setActiveSavedId(null);
                            }}
                            className="gold-ring inline-flex items-center justify-center w-9 h-9 rounded-full transition"
                            style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.88)", color: PALETTE.danger }}
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
            </>
            )}
          </div>
        </section>

        {bannedPlayersData.length > 0 && (
          <section className="mb-6 glass-card rounded-[28px] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div>
                <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                  <Ban size={18} className="lucide-icon" style={{ color: PALETTE.gold }} />
                  Unwanted players
                </h2>
                <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                  Players marked here are excluded from incoming recommendations.
                </div>
              </div>
              <div className="text-[11px] px-3 py-1 rounded-full" style={{ color: PALETTE.gold, border: `1px solid rgba(95,143,123,0.35)`, background: "rgba(95,143,123,0.08)" }}>
                {bannedPlayersData.length} blocked
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {bannedPlayersData.map((player) => (
                <div
                  key={player.Name}
                  className="relative flex items-center gap-2 px-2 py-2 rounded-full text-sm transition"
                  style={{ backgroundColor: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)", color: "#b91c1c" }}
                >
                  <img
                    src={player.photo}
                    alt={player.web_name}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "https://d2kq0urxkarztv.cloudfront.net/51812cad594df29a1a0003f0/661303/upload-643ff5d9-840e-4bbb-b099-07c26ef505c9.png?w=578";
                    }}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <span className="truncate max-w-[8rem]">{player.web_name}</span>
                  <button
                    onClick={() => removeBan(player.Name)}
                    className="gold-ring absolute -top-1 -right-1 rounded-full p-1"
                    style={{ backgroundColor: "rgba(248,250,252,0.94)", color: PALETTE.beige }}
                    aria-label={`Remove ${player.web_name} from unwanted`}
                  >
                    <X size={12} className="lucide-icon" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {data && (
          <section ref={pitchSectionRef} className="mb-6 grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6 items-start">
            <div className="glass-card rounded-[28px] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: PALETTE.gold }}>
                    <Trophy size={16} className="lucide-icon" />
                    Optimized XI GW {activeGW ?? minGW}
                  </div>
                  <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                    Tap a player to open analytics. Tap the X icon to mark as unwanted.
                  </div>
                </div>
              </div>

              {availableGWs.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => canGoPrevGW && setSelectedGW(availableGWs[activeGWIndex - 1])}
                      disabled={!canGoPrevGW}
                      className="gold-ring inline-flex items-center justify-center w-8 h-8 rounded-full"
                      style={{
                        border: `1px solid ${canGoPrevGW ? PALETTE.gold : PALETTE.border}`,
                        backgroundColor: canGoPrevGW ? "rgba(118,175,160,0.14)" : "rgba(248,250,252,0.75)",
                        color: canGoPrevGW ? PALETTE.gold : PALETTE.muted,
                        cursor: canGoPrevGW ? "pointer" : "not-allowed",
                      }}
                      aria-label="Previous gameweek"
                    >
                      <ChevronLeft size={15} className="lucide-icon" />
                    </button>

                    <div
                      className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={{ border: `1px solid ${PALETTE.border}`, color: PALETTE.beige, background: "rgba(248,250,252,0.75)" }}
                    >
                      GW {activeGW ?? minGW}
                    </div>

                    <button
                      type="button"
                      onClick={() => canGoNextGW && setSelectedGW(availableGWs[activeGWIndex + 1])}
                      disabled={!canGoNextGW}
                      className="gold-ring inline-flex items-center justify-center w-8 h-8 rounded-full"
                      style={{
                        border: `1px solid ${canGoNextGW ? PALETTE.gold : PALETTE.border}`,
                        backgroundColor: canGoNextGW ? "rgba(118,175,160,0.14)" : "rgba(248,250,252,0.75)",
                        color: canGoNextGW ? PALETTE.gold : PALETTE.muted,
                        cursor: canGoNextGW ? "pointer" : "not-allowed",
                      }}
                      aria-label="Next gameweek"
                    >
                      <ChevronRight size={15} className="lucide-icon" />
                    </button>
                  </div>

                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {availableGWs.map((gw) => {
                      const isActive = gw === activeGW;
                      return (
                        <button
                          key={gw}
                          type="button"
                          onClick={() => setSelectedGW(gw)}
                          className="gold-ring shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition"
                          style={{
                            border: `1px solid ${isActive ? PALETTE.gold : PALETTE.border}`,
                            background: isActive
                              ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})`
                              : "rgba(248,250,252,0.75)",
                            color: isActive ? "#0f172a" : PALETTE.beige,
                          }}
                        >
                          GW {gw}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 max-w-[420px] mx-auto">
                <TopStat icon={Target} label="Predicted" value={totalPredPoints != null ? totalPredPoints.toFixed(2) : "—"} />
                <TopStat icon={CalendarRange} label="Window" value={`GW ${minGW}-${maxGW}`} />
              </div>

      <div
  className="w-full max-w-[360px] sm:max-w-[420px] mx-auto aspect-[0.68/1] sm:aspect-[0.76/1] bg-no-repeat bg-cover bg-center rounded-[24px] px-1 sm:px-2 py-1 relative overflow-hidden"
  style={{
    backgroundImage: `url(${pitch})`,
    border: `1px solid ${PALETTE.border}`,
    boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
  }}
>
  <div className="absolute inset-0 bg-gradient-to-b from-slate-100/40 via-transparent to-slate-200/50 pointer-events-none" />

  <div className="relative flex flex-col justify-between h-[340px] xs:h-[360px] sm:h-[450px] pt-1 pb-14 sm:pb-16 w-full">
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
    <div className="absolute bottom-1 sm:bottom-2 left-0 right-0 px-1">
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
              <div className="mt-4 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleApplyToPlanner}
                  disabled={!plannerPayload.length}
                  className="gold-ring inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-full transition shadow-lg"
                  style={{
                    border: `1px solid ${plannerPayload.length ? PALETTE.gold : "#cbd5e1"}`,
                    background: plannerPayload.length ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "rgba(248,250,252,0.9)",
                    color: plannerPayload.length ? "#0f172a" : PALETTE.muted,
                    cursor: plannerPayload.length ? "pointer" : "not-allowed",
                  }}
                >
                  <Search size={18} className="lucide-icon" />
                  See transfers on My Team
                </button>

                {!plannerPayload.length && (
                  <div className="text-xs" style={{ color: PALETTE.muted }}>
                    Run an optimization with transfers first.
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card rounded-[28px] p-4 sm:p-5">
              <div className="flex items-end justify-between mb-4 gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold inline-flex items-center gap-2">
                    <ArrowRight size={20} className="lucide-icon" style={{ color: PALETTE.gold }} />
                    Transfer plan
                  </h2>
                  <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                    Recommended moves across your optimization window.
                  </div>
                </div>
                <div className="text-[11px] px-3 py-1 rounded-full" style={{ color: PALETTE.gold, border: `1px solid rgba(95,143,123,0.35)`, background: "rgba(95,143,123,0.08)" }}>
                  GW {minGW}–{maxGW}
                </div>
              </div>

              {transfersWithFH.length > 0 ? (
                <div className="space-y-4">
                  {transfersWithFH.map((grp) => {
                    const remainingIns = [...(grp.in || [])];
                    const pairs = (grp.out || []).map((outP) => {
                      const i = remainingIns.findIndex((inP) => inP.position === outP.position);
                      return i !== -1 ? { outP, inP: remainingIns.splice(i, 1)[0] } : { outP, inP: null };
                    });
                    remainingIns.forEach((inP) => pairs.push({ outP: null, inP }));

                    const realPairs = pairs.filter((x) => x.outP && x.inP);
                    if (realPairs.length === 0 && !grp.freehit) return null;

                    return (
                      <div
                        key={grp.GW}
                        className="rounded-[24px] overflow-hidden"
                        style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.82)", boxShadow: "0 14px 30px rgba(15,23,42,0.1)" }}
                      >
                        <div
                          className="px-4 py-3 flex items-center justify-between"
                          style={{ borderBottom: `1px solid ${PALETTE.border}`, background: "linear-gradient(135deg, rgba(95,143,123,0.14), rgba(248,250,252,0.84))" }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold"
                              style={{ backgroundColor: "rgba(248,250,252,0.9)", border: `1px solid ${PALETTE.gold}`, color: PALETTE.gold }}
                            >
                              {grp.GW}
                            </div>
                            <div>
                              <div className="text-sm font-semibold">Gameweek {grp.GW}</div>
                              <div className="text-[11px]" style={{ color: PALETTE.muted }}>
                                {realPairs.length} transfer{realPairs.length === 1 ? "" : "s"}
                              </div>
                            </div>
                          </div>

                          {grp.freehit && (
                            <span className="text-[11px] px-3 py-1 rounded-full font-semibold inline-flex items-center gap-1.5"
                              style={{ border: `1px solid ${PALETTE.gold}`, color: PALETTE.gold, backgroundColor: "rgba(248,250,252,0.86)" }}
                            >
                              <Zap size={12} className="lucide-icon" />
                              Free Hit
                            </span>
                          )}
                        </div>

                        <div className="divide-y" style={{ borderColor: PALETTE.border }}>
                          {realPairs.map(({ outP, inP }, idx) => (
                            <TransferRow
                              key={`${grp.GW}_${idx}`}
                              outP={outP}
                              inP={inP}
                              PALETTE={PALETTE}
                              navigate={navigate}
                              toggleBan={toggleBan}
                              bannedList={bannedList}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[24px] p-8 text-center" style={{ border: `1px dashed ${PALETTE.border}`, background: "rgba(248,250,252,0.72)" }}>
                  <ArrowRight size={26} className="lucide-icon mx-auto mb-2" style={{ color: PALETTE.gold }} />
                  <div className="text-sm font-semibold">No transfer plan yet</div>
                  <div className="text-xs mt-1" style={{ color: PALETTE.muted }}>
                    Run the optimizer to generate a recommended transfer timeline.
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {!data && (
          <section className="glass-card rounded-[28px] p-8 text-center">
            <Sparkles size={28} className="lucide-icon mx-auto mb-3" style={{ color: PALETTE.gold }} />
            <div className="text-lg font-semibold">Ready to optimize</div>
            <div className="text-sm mt-2 max-w-xl mx-auto" style={{ color: PALETTE.muted }}>
              Enter your team ID, choose your chip strategy, and run the optimizer to see your XI and transfer plan.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function TopStat({ icon: Icon, label, value }) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ border: `1px solid ${PALETTE.border}`, background: "rgba(248,250,252,0.82)" }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>
        <Icon size={14} className="lucide-icon" />
        {label}
      </div>
      <div className="text-lg font-bold mt-1" style={{ color: PALETTE.gold }}>{value}</div>
    </div>
  );
}

function FieldShell({ label, icon: Icon, className = "", children }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 w-full ${className}`}>
      <label className="text-xs uppercase tracking-wide inline-flex items-center gap-2 min-w-0" style={{ color: PALETTE.beige }}>
        <Icon size={13} className="lucide-icon" style={{ color: PALETTE.gold }} />
        {label}
      </label>
      {children}
    </div>
  );
}

function ModelButton({ active, disabled, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gold-ring min-w-0 w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-xs sm:text-sm border transition text-center leading-tight whitespace-normal"
      style={{
        border: disabled ? `1px solid ${PALETTE.border}` : active ? `1px solid ${PALETTE.gold}` : `1px solid ${PALETTE.border}`,
        background: disabled ? "rgba(248,250,252,0.84)" : active ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "rgba(248,250,252,0.92)",
        color: disabled ? "#6b7280" : active ? "#0f172a" : PALETTE.beige,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <Icon size={15} className="lucide-icon" />
      {children}
    </button>
  );
}

function ChipSelect({ label, show, onShow, onHide, value, onChange, minGW, maxGW, addLabel, icon: Icon }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-wide inline-flex items-center gap-2 min-w-0" style={{ color: PALETTE.beige }}>
        <Icon size={13} className="lucide-icon" style={{ color: PALETTE.gold }} />
        {label}
      </label>

      {show ? (
        <div className="relative">
          <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            style={{
              colorScheme: "dark",
              border: `1px solid ${PALETTE.border}`,
              backgroundColor: "rgba(248,250,252,0.94)",
              color: PALETTE.beige,
            }}
            className="gold-ring w-full h-12 pl-3 pr-10 rounded-2xl text-sm outline-none"
            aria-label={label}
          >
            <option value="" disabled>{label}</option>
            {Array.from({ length: maxGW - minGW + 1 }, (_, i) => minGW + i).map((gw) => (
              <option key={gw} value={gw}>GW {gw}</option>
            ))}
          </select>

          <button
            onClick={onHide}
            className="gold-ring absolute inset-y-0 right-0 px-3 flex items-center rounded-r-2xl border-l border-slate-300 bg-slate-200/85 hover:bg-slate-300/85 transition-colors"
            style={{ color: PALETTE.danger }}
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
          className="gold-ring min-w-0 h-auto min-h-[48px] w-full inline-flex items-center justify-center gap-2 rounded-2xl text-sm text-center leading-tight whitespace-normal px-3 py-2"
          style={{ border: `1px dashed ${PALETTE.gold}`, backgroundColor: "rgba(248,250,252,0.95)", color: PALETTE.gold }}
        >
          <Icon size={15} className="lucide-icon" />
          {addLabel}
        </button>
      )}
    </div>
  );
}

function PreferenceSlider({ title, icon: Icon, value, setValue, min, max, step, clamp, presets, description, fillPercent }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl p-3 min-w-0 w-full overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${PALETTE.border}` }}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs uppercase tracking-wide inline-flex items-center gap-2 min-w-0" style={{ color: PALETTE.beige }}>
          <Icon size={13} className="lucide-icon" style={{ color: PALETTE.gold }} />
          {title}
        </label>

      </div>

      <div className="flex items-center gap-2 flex-wrap min-w-0">
        {presets.map((preset) => (
          <MiniPill key={preset.label} active={Number(value) === preset.value} onClick={() => setValue(preset.value)}>
            {preset.label}
          </MiniPill>
        ))}
      </div>

      <div className="h-12 rounded-xl px-3 flex items-center" style={{ backgroundColor: "rgba(248,250,252,0.95)", border: `1px solid ${PALETTE.border}` }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamp(Number(value))}
          onChange={(e) => setValue(clamp(Number(e.target.value)))}
          aria-label={title}
          className="opt-range w-full appearance-none bg-transparent cursor-pointer"
          style={{
            WebkitAppearance: "none",
            height: 6,
            background: `linear-gradient(to right, ${PALETTE.gold} 0%, ${PALETTE.gold} ${fillPercent}%, #cbd5e1 ${fillPercent}%, #cbd5e1 100%)`,
            borderRadius: 999,
          }}
        />
      </div>

      <p className="text-[11px]" style={{ color: PALETTE.muted }}>{description}</p>
    </div>
  );
}

function IconButton({ ariaLabel, onClick, label }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="gold-ring inline-flex items-center justify-center w-8 h-8 rounded-full text-sm leading-none"
      style={{ border: `1px solid ${PALETTE.border}`, backgroundColor: "rgba(248,250,252,0.95)", color: PALETTE.gold }}
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
      className="gold-ring max-w-full px-3 py-2 text-[11px] font-semibold transition rounded-full whitespace-normal break-words text-center leading-tight"
      style={{
        border: `1px solid ${PALETTE.gold}`,
        background: active ? `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldSoft})` : "rgba(248,250,252,0.88)",
        color: active ? "#0f172a" : PALETTE.gold,
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
    <div
      className={`w-full min-w-0 flex justify-center items-start ${
        isBench ? "gap-1" : "gap-1.5 sm:gap-2"
      } px-0.5 text-center`}
    >
      {sortedPlayers.map((p) => (
        <div
          key={p.Name}
          className={`relative min-w-0 flex flex-col items-center ${
            isBench ? "w-[58px] sm:w-[66px]" : "w-[60px] sm:w-[70px]"
          }`}
        >
          {p.Is_captain && (
            <div className="absolute top-[18px] left-[2px] bg-emerald-700 text-white font-bold text-[9px] rounded-full w-4 h-4 flex items-center justify-center shadow z-10">
              C
            </div>
          )}

          <div className="relative">
            <img
              src={p.photo}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = fallback;
              }}
              className={`object-contain drop-shadow cursor-pointer transition-transform hover:scale-[1.07] ${
                isBench
                  ? "w-[44px] h-[44px] sm:w-[52px] sm:h-[50px]"
                  : "w-[45px] h-[55px] sm:w-[58px] sm:h-[62px]"
              }`}
              onClick={() =>
                navigate("/Player_Analytics/Individual", {
                  state: { selectedPlayer: p.Name },
                })
              }
              alt={p.web_name}
              role="button"
            />

            <button
              onClick={() => toggleBan(p.Name)}
              className="gold-ring absolute top-0 right-0 translate-x-[2px] -translate-y-[2px] bg-white p-[3px] rounded-full border border-slate-200 hover:bg-slate-50"
              aria-label={`Toggle unwanted for ${p.web_name}`}
            >
              <X
                size={8}
                className="lucide-icon"
                style={{
                  color: bannedList.includes(p.Name) ? "#fb7185" : PALETTE.gold,
                }}
              />
            </button>
          </div>

          <div
            className={`mt-1 truncate rounded-full bg-gray-100/90 text-slate-800 mx-auto ${
              isBench
                ? "w-[56px] sm:w-[64px] text-[9px] sm:text-[10px] px-1 py-[3px]"
                : "w-[58px] sm:w-[68px] text-[9px] sm:text-[11px] px-1.5 py-[3px]"
            }`}
          >
            {p.web_name}
          </div>
        </div>
      ))}
    </div>
  );
}

function PosPill({ pos }) {
  const map = { GKP: { label: "GK" }, DEF: { label: "DEF" }, MID: { label: "MID" }, FWD: { label: "FWD" } };
  const t = map[pos] || { label: pos || "-" };

  return (
    <span
      className="text-[10px] font-bold px-2 py-1 rounded-full"
      style={{ border: `1px solid rgba(148,163,184,0.35)`, backgroundColor: "rgba(248,250,252,0.9)", color: PALETTE.gold, letterSpacing: "0.08em" }}
    >
      {t.label}
    </span>
  );
}

function PlayerChip({ p, side, navigate, toggleBan, bannedList }) {
  const isIn = side === "in";
  const isBanned = bannedList?.includes(p?.Name);

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative">
        <img
          src={p.photo}
          alt={p.web_name}
          className="w-11 h-11 rounded-xl object-cover cursor-pointer"
          style={{ border: "1px solid rgba(148,163,184,0.35)" }}
          onClick={() => navigate("/Player_Analytics/Individual", { state: { selectedPlayer: p.Name } })}
          role="button"
        />
        {isIn && (
          <button
            type="button"
            onClick={() => toggleBan(p.Name)}
            className="gold-ring absolute -top-2 -right-2 rounded-full p-1"
            style={{ backgroundColor: "rgba(248,250,252,0.92)", border: "1px solid rgba(148,163,184,0.35)" }}
            aria-label={`Toggle unwanted for ${p.web_name}`}
            title="Toggle unwanted"
          >
            <X size={12} className="lucide-icon" style={{ color: isBanned ? "#fb7185" : PALETTE.gold }} />
          </button>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{p.web_name}</div>
        <div className="text-[11px] truncate" style={{ color: PALETTE.muted }}>
          {p.Team ? String(p.Team) : ""}
        </div>
      </div>
    </div>
  );
}

function TransferRow({ outP, inP, navigate, toggleBan, bannedList }) {
  return (
    <div className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="grid grid-cols-12 items-center gap-3">
        <div className="col-span-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>Out</div>
            <PosPill pos={outP.position} />
          </div>
          <div className="mt-1">
            <PlayerChip p={outP} side="out" navigate={navigate} toggleBan={toggleBan} bannedList={bannedList} />
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(248,250,252,0.8)", border: `1px solid rgba(95,143,123,0.35)`, color: PALETTE.gold }}
          >
            <ArrowRight size={18} className="lucide-icon" />
          </div>
        </div>

        <div className="col-span-5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>In</div>
            <PosPill pos={inP.position} />
          </div>
          <div className="mt-1">
            <PlayerChip p={inP} side="in" navigate={navigate} toggleBan={toggleBan} bannedList={bannedList} />
          </div>
        </div>
      </div>
    </div>
  );
}





