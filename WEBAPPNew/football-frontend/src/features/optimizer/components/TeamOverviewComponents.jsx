import { ChevronDown, ChevronUp, CircleArrowRight } from "lucide-react";
import {
  glassCard,
  softCard,
  opponentStrengthTone
} from '../utils/teamOverview.js';

export function ChartCard({ title, open, onToggle, children }) {
  return (
    <div className="rounded-3xl p-4 sm:p-5" style={glassCard}>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left rounded-2xl px-3 py-2"
        style={{
          background: "rgba(15,23,42,0.64)",
          color: "#1e293b",
          border: "1px solid rgba(148,163,184,0.22)",
        }}
      >
        <h2 className="text-sm sm:text-base font-semibold">{title}</h2>
        {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {children}
    </div>
  );
}

export function SquadMetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone = "gold",
}) {
  const toneMap = {
    green: {
      border: "rgba(52,211,153,0.3)",
      value: "#34d399",
      iconBg: "rgba(52,211,153,0.12)",
    },
    red: {
      border: "rgba(248,113,113,0.3)",
      value: "#f87171",
      iconBg: "rgba(248,113,113,0.12)",
    },
    blue: {
      border: "rgba(96,165,250,0.3)",
      value: "#60a5fa",
      iconBg: "rgba(96,165,250,0.12)",
    },
    purple: {
      border: "rgba(196,181,253,0.3)",
      value: "#c4b5fd",
      iconBg: "rgba(196,181,253,0.12)",
    },
    gold: {
      border: "rgba(251,191,36,0.3)",
      value: "#fbbf24",
      iconBg: "rgba(251,191,36,0.12)",
    },
  };

  const colors = toneMap[tone] || toneMap.gold;

  return (
    <div
      className="rounded-2xl p-3 sm:p-4"
      style={{
        ...softCard,
        border: `1px solid ${colors.border}`,
        background: "rgba(248,250,252,0.82)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-slate-600 mb-1">
            {label}
          </div>
          <div className="text-lg sm:text-xl font-bold" style={{ color: colors.value }}>
            {value}
          </div>
          {subValue && <div className="text-[10px] text-slate-500 mt-1">{subValue}</div>}
        </div>

        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: colors.iconBg }}
        >
          <Icon size={16} style={{ color: colors.value }} />
        </div>
      </div>
    </div>
  );
}

export function PitchRow({
  players,
  label,
  dragInfo,
  swapModeActive,
  onDrop,
  onClickSwap,
  openProfile,
}) {
  return (
    <div className="flex justify-center gap-2 sm:gap-3 px-1">
      {players.map((player) => {
        const hasPhoto = !!player.photo;
        const selectedText =
          player.selected_pct != null ? `${player.selected_pct.toFixed(1)}%` : "–";
        const costRaw = player.now_cost != null ? Number(player.now_cost) : null;
        const costDisplay =
          costRaw != null && Number.isFinite(costRaw)
            ? (costRaw / 10).toFixed(1)
            : null;
        const oppShort = player.opponent_display || "N/A";
        const oppFull = player.opponent_raw || oppShort;
        const oppTone =
          player.opponent_tone || opponentStrengthTone(player.opponent_strength);
        const oppDisplay = oppFull || oppShort || "N/A";
        const droppable = dragInfo && dragInfo.type === "bench";
        const highlightAsTarget = swapModeActive || droppable;

        return (
          <div
            key={`${player.name}-${player.squadIndex}`}
            className="relative group flex flex-col items-center text-center text-[10px] sm:text-xs w-[76px] sm:w-[94px]"
            onClick={() => {
              if (onClickSwap) onClickSwap(player.squadIndex);
            }}
            onDragOver={(e) => {
              if (dragInfo && dragInfo.type === "bench") e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!dragInfo || dragInfo.type !== "bench") return;
              onDrop(dragInfo.squadIndex, player.squadIndex);
            }}
          >
            {highlightAsTarget && (
              <div
                className="absolute inset-x-1 -top-1 bottom-0 rounded-2xl pointer-events-none"
                style={{
                  border: "1px dashed rgba(251,191,36,0.4)",
                  boxShadow: "0 0 0 2px rgba(251,191,36,0.08)",
                }}
              />
            )}

            {droppable && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-amber-300/30 text-amber-200 whitespace-nowrap">
                Drop to swap
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openProfile && openProfile(player);
              }}
              className="absolute -top-1.5 right-0 p-1.5 rounded-full border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 shadow-sm"
              title="Open profile"
            >
              <CircleArrowRight size={14} className="text-emerald-700" />
            </button>

            <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-20 hidden group-hover:flex flex-col items-center px-2 py-1 rounded-md bg-white border border-white/20 shadow-lg">
              <div className="text-[9px] text-slate-700">
                {label} • Sel {selectedText}
              </div>
              {costDisplay && (
                <div className="text-[9px] text-slate-700">£{costDisplay}m</div>
              )}
            </div>

            {hasPhoto ? (
              <img
                src={player.photo}
                alt={player.web_name}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover bg-gray-700 shadow"
                onError={(e) => {
                  e.currentTarget.src = "";
                }}
              />
            ) : (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-800 shadow" />
            )}

            <div className="mt-1 font-semibold truncate max-w-[92px]">
              {player.web_name}
            </div>

            <div className="mt-0.5 flex flex-col items-center gap-0.5 w-full">
              <div
                className="px-2 py-0.5 rounded-full border text-[9px] sm:text-[10px] font-semibold leading-tight max-w-full"
                style={{
                  background: oppTone.badgeBg,
                  borderColor: oppTone.badgeBorder,
                  color: oppTone.badgeText,
                }}
                title={oppFull}
              >
                <span className="block truncate max-w-[70px] sm:max-w-[86px]">
                  {oppDisplay}
                </span>
              </div>
              <div className="px-1.5 py-0.5 rounded-full bg-gray-900/90 text-[9px] font-bold text-amber-300">
                {player.points_prediction.toFixed(1)} pts
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CompareCard({ title, player, accent = "amber", placeholder = "—" }) {
  const ring =
    accent === "emerald" ? "border-teal-400/30" : "border-amber-400/30";
  const titleColor =
    accent === "emerald" ? "text-teal-200" : "text-amber-200";

  return (
    <div className={`rounded-2xl border ${ring} bg-slate-50 p-3 min-w-0`}>
      <div className={`text-[10px] uppercase tracking-wide ${titleColor} mb-2`}>
        {title}
      </div>

      {!player ? (
        <div className="text-[11px] text-slate-500 py-5 text-center">
          {placeholder}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {player.photo ? (
            <img
              src={player.photo}
              alt={player.web_name}
              className="w-10 h-10 rounded-full object-cover bg-gray-800"
              onError={(e) => {
                e.currentTarget.src = "";
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-800" />
          )}

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{player.web_name}</div>

            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-600">
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5">
                <div className="text-[9px] text-slate-500">Price</div>
                <div className="font-semibold">
                  {player.price != null ? `£${Number(player.price).toFixed(1)}m` : "–"}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5">
                <div className="text-[9px] text-slate-500">Sel</div>
                <div className="font-semibold">
                  {player.selected_pct != null
                    ? `${Number(player.selected_pct).toFixed(1)}%`
                    : "–"}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5">
                <div className="text-[9px] text-slate-500">Pts</div>
                <div className="font-semibold">
                  {player.totalPoints != null
                    ? Number(player.totalPoints).toFixed(1)
                    : "–"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
