import { useState, useMemo } from "react";
import { X, ArrowRight, ChevronDown, GripVertical } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PALETTE } from '../theme.js';
import { normalizeLoosePlayerKey, MEASURE_OPTIONS, getRowMeasureValue, formatMeasureValue, getRowSelectedPercent, FALLBACK_PLAYER_PHOTO, getPlayerDisplayName, getPlayerCanonicalName, getPlayerPhoto, opponentStrengthTone } from '../utils/workspaceHelpers.js';

export function TreeTransferRow({ outPlayer, inPlayer, caption, onRemove }) {
  return (
    <div className="mx-auto mt-2 w-fit max-w-full rounded-xl bg-slate-50 px-2 py-1.5" aria-label={caption}>
      <div className="mb-1 text-center text-[9px] font-semibold text-slate-500">{caption}</div>
      <div className="flex items-center justify-center gap-1.5">
        <img src={getPlayerPhoto(outPlayer)} alt={getPlayerDisplayName(outPlayer)} className="h-8 w-8 shrink-0 rounded-full object-cover" />
        <span className="min-w-0 max-w-24 truncate text-[10px]" title={getPlayerDisplayName(outPlayer)}>{getPlayerDisplayName(outPlayer)}</span>
        <ArrowRight size={12} className="shrink-0 text-slate-400" />
        <span className="min-w-0 max-w-24 truncate text-[10px]" title={getPlayerDisplayName(inPlayer)}>{getPlayerDisplayName(inPlayer)}</span>
        <img src={getPlayerPhoto(inPlayer)} alt={getPlayerDisplayName(inPlayer)} className="h-8 w-8 shrink-0 rounded-full object-cover" />
        {onRemove && <button type="button" onClick={onRemove} className="shrink-0 rounded-full p-0.5 text-red-500" aria-label={`Remove ${getPlayerDisplayName(outPlayer)} to ${getPlayerDisplayName(inPlayer)}`}><X size={12} /></button>}
      </div>
    </div>
  );
}

export function PlayerRow({
  players,
  isBench = false,
  toggleBan,
  bannedList,
  navigate,
  getOpponentMeta,
  activeGW,
  getProjectionRowForPlayer,
  teamMeasure = "points",
  selectedMeasureMeta = MEASURE_OPTIONS[0],
  draggedPlayerName,
  switchableTargetNames,
  onDropOnPlayer,
  onDragStateChange,
  onTogglePlayerStatus,
}) {
  const positionOrder = ["GKP", "DEF", "MID", "FWD"];
  const sortedPlayers = isBench
    ? [...players].sort((a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position))
    : players;
  const dynamicGap = isBench
    ? "clamp(2px, 1vw, 16px)"
    : sortedPlayers.length >= 5
    ? "clamp(2px, 1.2vw, 18px)"
    : "clamp(4px, 1.6vw, 24px)";

  return (
    <div className="w-full min-w-0 px-0.5">
      <div
        className="grid items-start justify-items-center"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, sortedPlayers.length)}, minmax(0, 1fr))`,
          columnGap: dynamicGap,
        }}
      >
        {sortedPlayers.map((p) => {
          const playerName = getPlayerCanonicalName(p);
          const looseName = normalizeLoosePlayerKey(playerName);
          const isDraggingThis = normalizeLoosePlayerKey(draggedPlayerName) === looseName;
          const isDraggingAny = Boolean(draggedPlayerName);
          const canReceiveDrop = Boolean(switchableTargetNames?.has(looseName));
          const oppMeta =
            typeof getOpponentMeta === "function"
              ? getOpponentMeta(p)
              : { display: "N/A", full: "N/A", venue: null, tone: opponentStrengthTone(null) };
          const projectionRow =
            typeof getProjectionRowForPlayer === "function" && Number.isFinite(Number(activeGW))
              ? getProjectionRowForPlayer(p, Number(activeGW))
              : null;
          const selectedMeasureValue = getRowMeasureValue(projectionRow || p, teamMeasure);
          const hasSelectedMeasureValue = Number.isFinite(selectedMeasureValue);
          const selectedPercent = getRowSelectedPercent(projectionRow || p);
          const hasSelectedPercent = Number.isFinite(selectedPercent);
          const cardWidthClass = isBench
            ? "w-[60px] sm:w-[72px] lg:w-[96px] xl:w-[112px]"
            : "w-[64px] sm:w-[78px] lg:w-[110px] xl:w-[128px]";

          return (
            <div
              key={p.Name}
              className={`group relative min-w-0 w-full flex flex-col items-center rounded-2xl transition-all duration-150 ${
                isBench
                  ? "max-w-[62px] sm:max-w-[74px] lg:max-w-[100px] xl:max-w-[116px]"
                  : "max-w-[68px] sm:max-w-[82px] lg:max-w-[114px] xl:max-w-[132px]"
              }`}
              draggable={Boolean(onDropOnPlayer)}
              onDragStart={(e) => {
                if (!playerName) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", playerName);
                onDragStateChange?.(playerName);
              }}
              onDragEnd={() => onDragStateChange?.("")}
              onDragOver={(e) => {
                if (!canReceiveDrop) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                if (!canReceiveDrop) return;
                e.preventDefault();
                e.stopPropagation();
                const sourceName = e.dataTransfer.getData("text/plain");
                onDropOnPlayer?.(sourceName, playerName);
              }}
              style={{
                outline: canReceiveDrop ? `2px solid ${PALETTE.success}` : "2px solid transparent",
                outlineOffset: "3px",
                background: canReceiveDrop ? "rgba(22,163,74,0.12)" : "transparent",
                opacity: isDraggingAny && !canReceiveDrop && !isDraggingThis ? 0.45 : 1,
                transform: canReceiveDrop ? "translateY(-2px) scale(1.03)" : "none",
              }}
            >
              {p.Is_captain && (
                <div className="absolute top-[12px] left-[2px] bg-emerald-700 text-white font-bold text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center shadow z-10">
                  C
                </div>
              )}

              <div className="relative">
                <div
                  className="pointer-events-none absolute -left-2 top-2 z-20 rounded-full p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  style={{
                    background: "rgba(15,23,42,0.88)",
                    color: "#fff",
                    border: `1px solid ${PALETTE.gold}`,
                  }}
                  title="Drag to switch"
                >
                  <GripVertical size={10} className="lucide-icon" />
                </div>

                <img
                  src={p.photo}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = FALLBACK_PLAYER_PHOTO;
                  }}
                  className={`object-contain drop-shadow cursor-pointer transition-transform hover:scale-[1.07] ${
                    isBench
                      ? "w-[46px] h-[48px] sm:w-[56px] sm:h-[58px] lg:w-[76px] lg:h-[80px] xl:w-[88px] xl:h-[92px]"
                      : "w-[50px] h-[58px] sm:w-[64px] sm:h-[70px] lg:w-[88px] lg:h-[96px] xl:w-[104px] xl:h-[112px]"
                  }`}
                  style={{ clipPath: "polygon(0 0, 100% 0, 100% 70%, 0 100%)" }}
                  onClick={() =>
                    navigate("/Player_Analytics/Individual", {
                      state: { selectedPlayer: p.Name },
                    })
                  }
                  alt={p.web_name}
                  role="button"
                />

                {hasSelectedMeasureValue && (
                  <div
                    className={`absolute rounded-full px-1.5 py-[2px] font-bold shadow-sm backdrop-blur ${
                      isBench
                        ? "bottom-[-3px] text-[8px] lg:text-[10px] xl:text-[11px]"
                        : "bottom-[-4px] text-[9px] lg:text-[11px] xl:text-xs"
                    }`}
                    style={{
                      left: "58%",
                      transform: "translateX(-50%)",
                      background: "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.82))",
                      border: `1px solid ${PALETTE.gold}`,
                      color: "#fef3c7",
                    }}
                    title={`${selectedMeasureMeta.label} GW ${activeGW}`}
                  >
                    {formatMeasureValue(selectedMeasureValue, teamMeasure)}
                  </div>
                )}

                <button
                  onClick={() => toggleBan(p.Name)}
                  className="gold-ring absolute top-0 right-0 bg-white p-[3px] rounded-full border border-slate-200 hover:bg-slate-50"
                  aria-label={`Toggle unwanted for ${p.web_name}`}
                >
                  <X
                    size={8}
                    className="lucide-icon"
                    style={{ color: bannedList.includes(p.Name) ? "#fb7185" : PALETTE.gold }}
                  />
                </button>
              </div>

              <div
                className={`mt-1 truncate rounded-full bg-gray-100/90 text-slate-800 mx-auto text-center ${
                  isBench
                    ? `${cardWidthClass} text-[9px] sm:text-[10px] lg:text-xs xl:text-sm px-1 py-[3px] lg:py-1`
                    : `${cardWidthClass} text-[9px] sm:text-[11px] lg:text-sm xl:text-[15px] px-1.5 py-[3px] lg:py-1`
                }`}
              >
                {p.web_name}
              </div>

              <div
                className={`mt-0.5 mx-auto flex items-center justify-between gap-1 rounded-full border px-1 py-[1px] font-semibold ${cardWidthClass} ${
                  isBench
                    ? "text-[7px] sm:text-[8px] lg:text-[10px] xl:text-[11px]"
                    : "text-[7px] sm:text-[8px] lg:text-[10px] xl:text-xs"
                }`}
                style={{
                  background: oppMeta.tone.badgeBg,
                  borderColor: oppMeta.tone.badgeBorder,
                  color: oppMeta.tone.badgeText,
                }}
                title={`${oppMeta.full}${oppMeta.venue ? ` (${oppMeta.venue})` : ""}${hasSelectedPercent ? ` | Selected ${selectedPercent.toFixed(1)}%` : ""}`}
              >
                <span className="min-w-0 flex-1 truncate text-center">
                  {oppMeta.display}{oppMeta.venue ? ` (${oppMeta.venue})` : ""}
                </span>
                {hasSelectedPercent && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-[1px] tabular-nums"
                    style={{ background: "rgba(15,23,42,0.94)", color: "#ffffff" }}
                  >
                    {`${selectedPercent.toFixed(selectedPercent >= 10 ? 0 : 1)}%`}
                  </span>
                )}
              </div>

              {typeof onTogglePlayerStatus === "function" && (
                <button
                  type="button"
                  onClick={() => onTogglePlayerStatus(playerName, isBench ? "playing" : "benched")}
                  className={`mt-1 rounded-full border px-2 py-[2px] font-bold shadow-sm ${
                    isBench
                      ? "text-[7px] sm:text-[8px] lg:text-[10px]"
                      : "text-[7px] sm:text-[8px] lg:text-[10px] xl:text-[11px]"
                  }`}
                  style={{
                    borderColor: "rgba(95,143,123,0.35)",
                    background: "rgba(248,250,252,0.92)",
                    color: PALETTE.gold,
                  }}
                >
                  {isBench ? "Start" : "Bench"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PosPill({ pos }) {
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

export function PlayerChip({ p, side, navigate, toggleBan, bannedList }) {
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

export function TransferRow({
  outP,
  inP,
  navigate,
  toggleBan,
  bannedList,
  transferGW,
  buildTransferProjectionData,
}) {
  const [expanded, setExpanded] = useState(false);
  const chartData = useMemo(
    () => (typeof buildTransferProjectionData === "function" ? buildTransferProjectionData(outP, inP, transferGW) : []),
    [buildTransferProjectionData, outP, inP, transferGW]
  );
  const hasChartData = chartData.some(
    (row) => Number.isFinite(row.inPoints) || Number.isFinite(row.outPoints)
  );
  const totalIn = chartData.reduce(
    (sum, row) => sum + (Number.isFinite(row.inPoints) ? row.inPoints : 0),
    0
  );
  const totalOut = chartData.reduce(
    (sum, row) => sum + (Number.isFinite(row.outPoints) ? row.outPoints : 0),
    0
  );
  const swing = totalIn - totalOut;

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

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-[11px]" style={{ color: PALETTE.muted }}>
          From GW {transferGW}
          {hasChartData ? (
            <span style={{ color: swing >= 0 ? PALETTE.success : PALETTE.danger }}>
              {` · swing ${swing >= 0 ? "+" : ""}${swing.toFixed(2)} pts`}
            </span>
          ) : (
            " · chart unavailable"
          )}
        </div>

        <button
          type="button"
          onClick={() => hasChartData && setExpanded((v) => !v)}
          disabled={!hasChartData}
          className="gold-ring inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
          style={{
            border: `1px solid ${hasChartData ? PALETTE.gold : PALETTE.border}`,
            background: hasChartData ? "rgba(95,143,123,0.08)" : "rgba(248,250,252,0.8)",
            color: hasChartData ? PALETTE.gold : PALETTE.muted,
            cursor: hasChartData ? "pointer" : "not-allowed",
          }}
          aria-expanded={expanded}
        >
          {expanded ? "Hide chart" : "Show chart"}
          <ChevronDown
            size={14}
            className="lucide-icon"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}
          />
        </button>
      </div>

      {expanded && hasChartData && (
        <div
          className="mt-3 rounded-[20px] p-3 sm:p-4"
          style={{
            border: `1px solid ${PALETTE.border}`,
            background: "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(241,245,249,0.9))",
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: PALETTE.muted }}>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1" style={{ background: "rgba(34,197,94,0.08)", color: PALETTE.success }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.success }} />
              {inP.web_name}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1" style={{ background: "rgba(239,68,68,0.08)", color: PALETTE.danger }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.danger }} />
              {outP.web_name}
            </span>
          </div>

          <div className="h-[220px] sm:h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.24)" />
                <XAxis
                  dataKey="gw"
                  tick={{ fill: PALETTE.muted, fontSize: 11 }}
                  axisLine={{ stroke: "rgba(148,163,184,0.32)" }}
                  tickLine={{ stroke: "rgba(148,163,184,0.32)" }}
                />
                <YAxis
                  tick={{ fill: PALETTE.muted, fontSize: 11 }}
                  axisLine={{ stroke: "rgba(148,163,184,0.32)" }}
                  tickLine={{ stroke: "rgba(148,163,184,0.32)" }}
                  width={34}
                />
                <Tooltip content={<TransferChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="inPoints"
                  name={inP.web_name}
                  stroke={PALETTE.success}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="outPoints"
                  name={outP.web_name}
                  stroke={PALETTE.danger}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export function TransferChartTooltip({ active, payload, label }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      className="rounded-2xl px-3 py-2 text-xs shadow-xl"
      style={{
        background: "rgba(255,255,255,0.98)",
        border: `1px solid ${PALETTE.border}`,
        color: PALETTE.text,
      }}
    >
      <div className="font-semibold mb-1">GW {label}</div>
      <div className="flex items-start gap-2" style={{ color: PALETTE.success }}>
        <span className="mt-[5px] inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.success }} />
        <div>
          <div>{payload.find((x) => x.dataKey === "inPoints")?.name}: {Number.isFinite(row.inPoints) ? row.inPoints.toFixed(2) : "-"}</div>
          <div style={{ color: PALETTE.muted }}>Opposition: {row.inOpponent || "N/A"}</div>
        </div>
      </div>
      <div className="mt-2 flex items-start gap-2" style={{ color: PALETTE.danger }}>
        <span className="mt-[5px] inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.danger }} />
        <div>
          <div>{payload.find((x) => x.dataKey === "outPoints")?.name}: {Number.isFinite(row.outPoints) ? row.outPoints.toFixed(2) : "-"}</div>
          <div style={{ color: PALETTE.muted }}>Opposition: {row.outOpponent || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}
