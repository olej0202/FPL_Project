import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

const PALETTE = { gold: '#76AFA0', beige: '#1e293b', muted: '#64748b', border: 'rgba(148,163,184,0.35)' };

export function GlassCard({ children, className = "", style = {} }) {
  return (
    <div
      className={`rounded-[28px] border ${className}`}
      style={{
        borderColor: PALETTE.border,
        background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.95))",
        boxShadow: "0 14px 30px rgba(15,23,42,0.08)",
        backdropFilter: "blur(12px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function FilterCard({ icon, label, children }) {
  return (
    <div
      className="min-w-0 rounded-2xl p-4"
      style={{
        border: `1px solid ${PALETTE.border}`,
        background: "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(236,253,245,0.85))",
      }}
    >
      <label
        className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "#475569" }}
      >
        {icon ? React.createElement(icon, { size: 13, style: { color: PALETTE.gold } }) : null}
        {label}
      </label>
      {children}
    </div>
  );
}

export function PillButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-2 text-xs font-semibold transition"
      style={{
        border: `1px solid ${active ? PALETTE.gold : PALETTE.border}`,
        background: active ? `linear-gradient(135deg, ${PALETTE.gold}, #8FBCA9)` : "#f8fafc",
        color: active ? "#1e293b" : PALETTE.beige,
      }}
    >
      {children}
    </button>
  );
}

export function SearchableMultiSelect({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = "Search...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const panelId = useId();
  const [panelReady, setPanelReady] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState({});

  const filteredOptions = useMemo(() => {
    const term = search.toLowerCase();
    return options.filter((opt) => {
      const labelStr = (opt.label ?? "").toString().toLowerCase();
      const valueStr = (opt.value ?? "").toString().toLowerCase();
      return labelStr.includes(term) || valueStr.includes(term);
    });
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const toggleValue = useCallback(
    (value) => {
      if (selectedSet.has(value)) {
        onChange(selectedValues.filter((v) => v !== value));
      } else {
        onChange([...selectedValues, value]);
      }
    },
    [onChange, selectedSet, selectedValues]
  );

  const handleSelectAll = useCallback(() => onChange(options.map((o) => o.value)), [onChange, options]);
  const handleClearAll = useCallback(() => onChange([]), [onChange]);

  const selectedLabel =
    selectedValues.length === 0 ? "All" : `${selectedValues.length} selected`;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const padding = 12;
    const gap = 8;
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - padding * 2);
    const below = window.innerHeight - rect.bottom - gap - padding;
    const above = rect.top - gap - padding;
    const openAbove = below < 200 && above > below;
    const height = Math.min(320, Math.max(120, openAbove ? above : below));
    setPanelStyle({
      position: 'fixed',
      left: Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding)),
      top: openAbove ? Math.max(padding, rect.top - gap - height) : Math.max(padding, rect.bottom + gap),
      width, maxHeight: height, zIndex: 60,
    });
    setPanelReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelReady(false);
      return;
    }

    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleViewportChange = () => updatePosition();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onClickOutside = (event) => {
      const insideTrigger = triggerRef.current?.contains(event.target);
      const insidePanel = panelRef.current?.contains(event.target);
      if (!insideTrigger && !insidePanel) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && panelReady) panelRef.current?.querySelector('input[type="text"]')?.focus({ preventScroll: true });
  }, [isOpen, panelReady]);

  return (
    <div className="relative min-w-0">
      <label className="mb-2 block text-sm font-semibold" style={{ color: PALETTE.beige }}>
        {label}
      </label>

      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${selectedLabel}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          if (!isOpen) setPanelReady(false);
          setIsOpen((prev) => !prev);
        }}
        className="w-full rounded-2xl px-3 py-3 text-left text-sm transition-all duration-200"
        style={{
          border: `1px solid ${isOpen ? PALETTE.gold : PALETTE.border}`,
          background: "#f8fafc",
          color: PALETTE.beige,
          boxShadow: isOpen ? "0 0 0 1px rgba(95,143,123,0.18)" : "none",
        }}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown
            size={16}
            style={{
              color: PALETTE.gold,
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 180ms ease",
            }}
          />
        </span>
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`Select ${label.toLowerCase()}`}
          className="filter-popover flex flex-col overflow-hidden rounded-2xl"
          style={{
            ...panelStyle,
            visibility: panelReady ? "visible" : "hidden",
            opacity: panelReady ? 1 : 0,
            transform: panelReady ? "translateY(0)" : "translateY(-4px)",
            transition: "opacity 160ms ease, transform 160ms ease",
            border: `1px solid ${PALETTE.gold}`,
            background: "#ffffff",
            boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
          }}
        >
          <div className="p-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: PALETTE.muted }}
              />
              <input
                type="text"
                aria-label={`Search ${label.toLowerCase()}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl py-2 pl-9 pr-3 text-[16px] outline-none md:text-sm"
                style={{
                  border: `1px solid ${PALETTE.border}`,
                  background: "#ffffff",
                  color: PALETTE.beige,
                }}
              />
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex-1 rounded-full px-3 py-2 text-xs font-semibold"
                style={{
                  border: `1px solid ${PALETTE.gold}`,
                  background: "rgba(95,143,123,0.08)",
                  color: PALETTE.beige,
                }}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="flex-1 rounded-full px-3 py-2 text-xs font-semibold"
                style={{
                  border: `1px solid ${PALETTE.border}`,
                  background: "#f8fafc",
                  color: "#475569",
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="min-h-0 max-h-[180px] overflow-auto px-2 pb-3 text-sm">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2" style={{ color: PALETTE.muted }}>
                No matches
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors"
                    style={{
                      background: checked ? "rgba(95,143,123,0.14)" : "transparent",
                      color: PALETTE.beige,
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(opt.value)}
                      style={{ accentColor: PALETTE.gold }}
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>, document.body
      )}
    </div>
  );
}
