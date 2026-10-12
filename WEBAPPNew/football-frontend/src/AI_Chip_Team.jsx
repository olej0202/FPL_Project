import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Shirt } from "lucide-react";
import pitch from "./assets/Pitch4.png";
import "./AI_Chip_Team.css";
import { useAITeamData } from "./Contexts/AITeamsContext";

const isValidGW = (gw) => Number.isInteger(gw) && gw >= 1 && gw <= 38;
const EMPTY_ROWS = [];
const normalizeStatus = (status) => String(status || "").trim().toLowerCase();
const isBench = (player) => ["bench", "benched"].includes(normalizeStatus(player.status));
const playerName = (player) => player.web_name || player.Name?.replaceAll("_", " ") || "Player";
const isCaptain = (player) => ["true", "1"].includes(String(player.Is_captain).toLowerCase());
const controlClass = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-40";

function buildTransferGroups(rows) {
  const groups = new Map();
  for (const player of rows) {
    const status = normalizeStatus(player.status);
    const gw = Number(player.GW);
    if (!isValidGW(gw) || !["transferred_in", "transferred_out"].includes(status)) continue;
    if (!groups.has(gw)) groups.set(gw, { GW: gw, in: [], out: [] });
    groups.get(gw)[status === "transferred_in" ? "in" : "out"].push(player);
  }
  return [...groups.values()].sort((a, b) => a.GW - b.GW);
}

function pairTransfers(group) {
  const incoming = [...group.in];
  const pairs = group.out.map((outPlayer) => {
    const index = incoming.findIndex((player) => player.position === outPlayer.position);
    return { outPlayer, inPlayer: index < 0 ? null : incoming.splice(index, 1)[0] };
  });
  return [...pairs, ...incoming.map((inPlayer) => ({ outPlayer: null, inPlayer }))];
}

export default function AIChipTeam() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { fetchIfNeeded, freeHitData, wildcardData, loading } = useAITeamData();
  const mode = searchParams.get("mode") === "freehit" ? "freehit" : "wildcard";
  const chipLabel = mode === "freehit" ? "Free Hit" : "Wildcard";

  useEffect(() => { fetchIfNeeded(); }, [fetchIfNeeded]);

  const data = mode === "freehit" ? freeHitData?.current : wildcardData?.current;
  const rows = Array.isArray(data) ? data : EMPTY_ROWS;
  const gameweeks = useMemo(() => [...new Set(rows
    .filter((player) => normalizeStatus(player.status) === "playing" || isBench(player))
    .map((player) => Number(player.GW)).filter(isValidGW))].sort((a, b) => a - b), [rows]);
  const requestedGW = Number(searchParams.get("gw"));
  const activeGW = gameweeks.includes(requestedGW) ? requestedGW : gameweeks[0];
  const activeIndex = gameweeks.indexOf(activeGW);
  const squad = rows.filter((player) => Number(player.GW) === activeGW);
  const starters = squad.filter((player) => normalizeStatus(player.status) === "playing");
  const bench = squad.filter(isBench)
    .sort((a, b) => Number(b.position === "GKP") - Number(a.position === "GKP"));
  const transfers = useMemo(() => buildTransferGroups(rows), [rows]);
  const currentTransfers = transfers.find((group) => group.GW === activeGW);

  const setMode = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set("mode", next);
    params.delete("gw");
    setSearchParams(params, { replace: true });
  };
  const selectGW = (gw) => {
    if (!gameweeks.includes(gw)) return;
    const params = new URLSearchParams(searchParams);
    params.set("gw", String(gw));
    setSearchParams(params, { replace: true });
  };
  const openPlayer = (player) => navigate("/Player_Analytics/Individual", {
    state: { selectedPlayer: player.Name },
  });

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4 px-1 py-3 text-slate-800 sm:px-3 sm:py-5">
      <header className="space-y-3 text-center">
        <div className="mx-auto inline-flex max-w-full gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm" aria-label="AI chip team">
          {[["wildcard", "Wildcard"], ["freehit", "Free Hit"]].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
              className={`min-h-11 rounded-full px-5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${mode === value ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
        <div>
          <h1 className="text-xl font-bold sm:text-3xl">AI Optimized {chipLabel} Team</h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">Select a player to view their stats</p>
        </div>
      </header>

      {loading && rows.length === 0 ? (
        <div role="status" className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading team…</div>
      ) : !gameweeks.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No optimized {chipLabel.toLowerCase()} team available yet.</div>
      ) : (
        <section className="mx-auto w-full max-w-3xl min-w-0 space-y-3" aria-label={`${chipLabel} squad`}>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 sm:p-3">
            <nav className="flex items-center justify-between gap-1 sm:gap-3" aria-label="Gameweek navigation">
              <button type="button" className={controlClass} disabled={activeIndex <= 0} aria-label="Previous gameweek" onClick={() => selectGW(gameweeks[activeIndex - 1])}>
                <ChevronLeft size={16} /><span className="hidden sm:inline">Previous GW</span>
              </button>
              <span className="text-sm font-bold" aria-live="polite">Gameweek {activeGW}</span>
              <button type="button" className={controlClass} disabled={activeIndex >= gameweeks.length - 1} aria-label="Next gameweek" onClick={() => selectGW(gameweeks[activeIndex + 1])}>
                <span className="hidden sm:inline">Next GW</span><ChevronRight size={16} />
              </button>
            </nav>
            {gameweeks.length > 1 && <div className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center" aria-label="Available gameweeks">
              {gameweeks.map((gw) => <button key={gw} type="button" onClick={() => selectGW(gw)} aria-pressed={gw === activeGW}
                className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${gw === activeGW ? "border-emerald-800 bg-emerald-800 text-white" : "border-slate-200 bg-white hover:bg-slate-100"}`}>
                GW{gw}
              </button>)}
            </div>}
          </div>

          <details className="group rounded-2xl border border-slate-200 bg-white p-3" aria-label="All transfers">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
              All transfers<ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {gameweeks.map((gw) => <div key={gw} className="min-w-0 rounded-xl border border-slate-200 p-2 text-center">
                <button type="button" className="min-h-11 rounded-full px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-50" onClick={() => selectGW(gw)}>GW{gw}</button>
                {gw === gameweeks[0] ? <p className="py-2 text-sm font-semibold text-emerald-800">{chipLabel}</p>
                  : <TransferGroup group={transfers.find((group) => group.GW === gw)} onPlayer={openPlayer} />}
              </div>)}
            </div>
          </details>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center" aria-label="Selected gameweek transfers">
            {activeIndex === 0 ? <p className="text-sm font-semibold text-emerald-800">{chipLabel} · GW{activeGW}</p> : <>
              <h2 className="mb-2 text-xs font-semibold">Transfers · GW{activeGW}</h2>
              <TransferGroup group={currentTransfers} onPlayer={openPlayer} />
            </>}
          </div>

          <div className="chip-team-pitch" aria-label={`Pitch GW${activeGW}`}>
            <div className="chip-pitch-surface" style={{ backgroundImage: `url(${pitch})` }}>
            <div className="chip-pitch-starters">
              {["GKP", "DEF", "MID", "FWD"].map((position) => <PlayerRow key={position} players={starters.filter((player) => player.position === position)} onPlayer={openPlayer} label={position} />)}
            </div>
            <div className="chip-pitch-bench" aria-label="Bench">
              <h2 className="chip-pitch-bench-label">Bench</h2>
              <PlayerRow players={bench} onPlayer={openPlayer} label="Bench players" compact />
            </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function KitImage({ player, className }) {
  const [failedSource, setFailedSource] = useState(null);
  // Optimizer CSVs supply FPL shirt URLs in `photo`; do not fall back to headshots.
  const source = typeof player.photo === "string" && /(?:\/shirts\/|shirt_)/i.test(player.photo) ? player.photo : null;
  return <span className={`mx-auto block ${className}`}>
    {source && failedSource !== source ? <img src={source} alt="" draggable={false}
      onError={() => setFailedSource(source)} className="h-full w-full object-contain drop-shadow-sm" />
      : <Shirt aria-hidden="true" className="h-full w-full p-1 text-slate-600" fill="#e2e8f0" strokeWidth={1} />}
  </span>;
}

function PlayerRow({ players, onPlayer, label, compact = false }) {
  return <div className={`chip-pitch-row${compact ? " chip-pitch-row-compact" : ""}`} aria-label={label}>
    {players.map((player, index) => <button key={`${player.Name}_${index}`} type="button" onClick={() => onPlayer(player)}
      className="chip-pitch-player focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
      title={`View ${playerName(player)}`} aria-label={`View ${playerName(player)}${isCaptain(player) ? ', captain' : ''}`}>
      <span className="chip-pitch-player-visual">
        {isCaptain(player) && <span className="chip-pitch-captain">C</span>}
        <KitImage player={player} className="chip-pitch-kit" />
        <span className="chip-pitch-name">{playerName(player)}</span>
      </span>
    </button>)}
  </div>;
}

function TransferGroup({ group, onPlayer }) {
  const pairs = group ? pairTransfers(group) : [];
  if (!pairs.length) return <p className="py-2 text-xs text-slate-500">No transfers</p>;
  return <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
    {pairs.map(({ outPlayer, inPlayer }, index) => <div key={index} className="flex items-center justify-center gap-2">
      {outPlayer && <TransferCard player={outPlayer} label="Out" onPlayer={onPlayer} />}
      {outPlayer && inPlayer && <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-emerald-700" />}
      {inPlayer && <TransferCard player={inPlayer} label="In" onPlayer={onPlayer} />}
    </div>)}
  </div>;
}

function TransferCard({ player, label, onPlayer }) {
  return <button type="button" onClick={() => onPlayer(player)} aria-label={`${label}: ${playerName(player)}`}
    className="w-20 min-w-0 rounded-lg text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
    <KitImage player={player} className="h-12 w-12" />
    <span className="mt-1 block truncate text-[10px] font-semibold text-slate-800 sm:text-xs" title={playerName(player)}>{playerName(player)}</span>
    <span className={`text-[10px] font-semibold ${label === "Out" ? "text-rose-700" : "text-emerald-700"}`}>{label}</span>
  </button>;
}
