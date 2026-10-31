import React from "react";
import teamColors from "../../../utils/team_colors.js";
import { PALETTE, formatPrice, getBarIntensity } from '../utils/playerRankings.js';

export function TeamColorDot({ teamName }) {
  const color = teamColors?.[teamName] || "#6b7280";

  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{
        backgroundColor: color,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.18), 0 0 10px ${color}33`,
      }}
    />
  );
}

export function MeasureBarCell({ value, text, range }) {
  const intensity = getBarIntensity(value, range);
  const boostedIntensity = Math.min(1, Math.pow(intensity, 2.2) * 1.5);
  const alpha = 0.015 + boostedIntensity * 0.52;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `rgba(22, 163, 74, ${alpha})`,
          transition: "background-color 180ms ease",
        }}
      />
      <span className="relative z-[1] block px-4 py-3">{text}</span>
    </>
  );
}

export const PlayerRow = React.memo(function PlayerRow({
  row,
  idx,
  displayedGWs,
  selectedMeasure,
  formatter,
  onOpen,
  pointBarRanges,
}) {
  const showPredictionShading = Boolean(pointBarRanges);

  return (
    <tr
      onClick={() => onOpen(row.nameKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(row.nameKey);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open player details for ${row.displayName}`}
      className="cursor-pointer transition-all duration-150 focus:outline-none"
      style={{
        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
      }}
    >
      <td
        className="sticky left-0 z-[1] w-[140px] max-w-[140px] px-3 py-3 font-semibold sm:w-[220px] sm:max-w-[220px] sm:px-4"
        style={{
          background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div className="truncate text-[13px] sm:text-sm" title={row.displayName}>
          {row.displayName}
        </div>
      </td>

      <td className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {row.position || "-"}
      </td>

      <td className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div className="inline-flex items-center gap-2">
          <TeamColorDot teamName={row.teamName} />
          <span>{row.teamName || row.teamCode || "-"}</span>
        </div>
      </td>

      <td className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {Number.isFinite(row.value) ? formatPrice(row.value) : "-"}
      </td>

      <td className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {Number.isFinite(row.selected) ? `${row.selected.toFixed(1)}%` : "-"}
      </td>

      <td
        className="px-4 py-3 text-right font-semibold"
        style={{
          borderBottom: "1px solid #e2e8f0",
          color:
            row.priceChangePercent > 0
              ? "#15803d"
              : row.priceChangePercent < 0
                ? "#b91c1c"
                : "#64748b",
        }}
      >
        {Number.isFinite(row.priceChangePercent) ? `${row.priceChangePercent.toFixed(1)}%` : "-"}
      </td>

      {displayedGWs.map((gw) => {
        const cell = row.gwMeasures[gw]?.[selectedMeasure] ?? 0;
        return (
          <td
            key={gw}
            className={showPredictionShading ? "relative p-0 text-right" : "px-4 py-3 text-right"}
            style={{ borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #e2e8f0" }}
          >
            {showPredictionShading ? (
              <MeasureBarCell
                value={cell}
                text={formatter(cell)}
                range={pointBarRanges.gw}
              />
            ) : (
              formatter(cell)
            )}
          </td>
        );
      })}

      <td
        className="px-4 py-3 text-right font-semibold"
        style={{ borderBottom: "1px solid #e2e8f0", color: PALETTE.gold }}
      >
        {formatter(row.totalMeasure)}
      </td>
    </tr>
  );
});
