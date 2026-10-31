import { X } from "lucide-react";
import { PALETTE } from '../theme.js';

export function TopStat({ icon: Icon, label, value }) {
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

export function FieldShell({ label, icon: Icon, className = "", children }) {
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

export function ModelButton({ active, disabled, onClick, icon: Icon, children }) {
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

export function ChipSelect({ label, show, onShow, onHide, value, onChange, minGW, maxGW, addLabel, icon: Icon }) {
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

export function PreferenceSlider({ title, icon: Icon, value, setValue, min, max, step, clamp, presets, description, fillPercent }) {
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

export function IconButton({ ariaLabel, onClick, label }) {
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

export function MiniPill({ active, onClick, children }) {
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
