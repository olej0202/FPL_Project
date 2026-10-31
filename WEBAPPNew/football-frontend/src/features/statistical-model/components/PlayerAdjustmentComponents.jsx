import React from "react";
import { ChevronRight, MousePointerClick } from "lucide-react";
import teamColors from "../../../utils/team_colors.js";
import { PALETTE, getBarIntensity } from '../utils/playerAdjustments.js';

export function ClickHintPill() {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold"
      style={{
        border: `1px solid rgba(95,143,123,0.35)`,
        background: "rgba(95,143,123,0.08)",
        color: PALETTE.gold,
      }}
    >
      <MousePointerClick size={13} />
      Click a player row
    </div>
  );
}

export function TeamColorDot({ teamName }) {
  const color = teamColors?.[teamName] || "#6b7280";

  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
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
  onOpen,
  selectedMeasure,
  measureBarRange,
}) {
  return (
    <tr
      onClick={() => onOpen(row.nameKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row.nameKey);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open player adjustments for ${row.displayName}`}
      className="group cursor-pointer transition-all duration-150 focus:outline-none"
      style={{
        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
      }}
    >
      <td
        className="sticky left-0 z-[1] w-[128px] max-w-[128px] px-3 py-3 font-semibold sm:w-[220px] sm:max-w-[220px] sm:px-4"
        style={{
          background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] sm:text-sm" title={row.displayName}>
              {row.displayName}
            </div>
            <div
              className="mt-1 hidden items-center gap-1 text-[11px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100 sm:inline-flex"
              style={{ color: PALETTE.gold }}
            >
              <MousePointerClick size={11} />
              Adjust Player
            </div>
          </div>

          <div
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus:translate-x-0 group-focus:opacity-100 sm:flex"
            style={{
              border: `1px solid rgba(95,143,123,0.28)`,
              background: "rgba(95,143,123,0.08)",
              color: PALETTE.gold,
              transform: "translateX(-4px)",
            }}
          >
            <ChevronRight size={16} />
          </div>
        </div>
      </td>

      <td className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {row.position}
      </td>

      <td className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div className="inline-flex items-center gap-2">
          <TeamColorDot teamName={row.teamName} />
          <span>{row.teamName}</span>
        </div>
      </td>

      <td className="px-4 py-3 text-right" style={{ borderBottom: "1px solid #e2e8f0" }}>
        {row.value != null && !Number.isNaN(row.value) ? row.value.toFixed(1) : "-"}
      </td>

      {displayedGWs.map((gw) => {
        const cell = row.gwMeasures[gw];
        const displayValue = cell ? cell[selectedMeasure] : 0;
        return (
          <td
            key={gw}
            className="relative p-0 text-right"
            style={{ borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #e2e8f0" }}
          >
            <MeasureBarCell
              value={displayValue}
              text={
                displayValue != null && !Number.isNaN(displayValue)
                  ? Number(displayValue).toFixed(2)
                  : "0.00"
              }
              range={measureBarRange}
            />
          </td>
        );
      })}

      <td
        className="px-4 py-3 text-right font-semibold"
        style={{ borderBottom: "1px solid #e2e8f0", color: PALETTE.gold }}
      >
        {row.totalMeasure != null && !Number.isNaN(row.totalMeasure)
          ? row.totalMeasure.toFixed(2)
          : "0.00"}
      </td>
    </tr>
  );
});
