import React, { useMemo } from "react";
import Select from "react-select";
import { DEFAULT_SCENARIO_COLOR } from "../Contexts/AdjustmentsContext";

export function ScenarioColorDot({ color, size = 9, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ring-1 ring-black/10 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color || DEFAULT_SCENARIO_COLOR,
      }}
    />
  );
}

export default function ScenarioSelect({
  scenarios = [],
  value,
  onChange,
  extraOptions = [],
  compact = false,
  ariaLabel = "Scenario",
  inputId,
  className = "",
}) {
  const options = useMemo(
    () => [
      ...extraOptions,
      ...scenarios.map((scenario) => ({
        value: scenario.id,
        label: scenario.name,
        color: scenario.color || DEFAULT_SCENARIO_COLOR,
      })),
    ],
    [extraOptions, scenarios]
  );
  const selectedOption = options.find((option) => String(option.value) === String(value)) || null;

  return (
    <Select
      className={className}
      value={selectedOption}
      options={options}
      onChange={(option) => option && onChange?.(option.value)}
      isSearchable={false}
      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
      menuPosition="fixed"
      aria-label={ariaLabel}
      inputId={inputId}
      formatOptionLabel={(option) => (
        <span className="flex min-w-0 items-center gap-2">
          <ScenarioColorDot color={option.color} />
          <span className="truncate">{option.label}</span>
        </span>
      )}
      styles={{
        control: (base, state) => ({
          ...base,
          minHeight: compact ? 32 : 40,
          height: compact ? 32 : 40,
          borderRadius: compact ? 8 : 12,
          borderColor: state.isFocused ? "#38bdf8" : "rgba(148,163,184,0.55)",
          boxShadow: "none",
          fontSize: compact ? 12 : 14,
          fontWeight: 600,
          cursor: "pointer",
        }),
        valueContainer: (base) => ({ ...base, padding: compact ? "0 8px" : "0 12px" }),
        indicatorsContainer: (base) => ({ ...base, height: compact ? 30 : 38 }),
        dropdownIndicator: (base) => ({ ...base, padding: compact ? 5 : 8 }),
        indicatorSeparator: () => ({ display: "none" }),
        menuPortal: (base) => ({ ...base, zIndex: 10000 }),
        menu: (base) => ({ ...base, zIndex: 10000, overflow: "hidden", borderRadius: 10 }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isSelected
            ? "rgba(95,143,123,0.18)"
            : state.isFocused
              ? "rgba(241,245,249,0.98)"
              : "white",
          color: "#0f172a",
          cursor: "pointer",
          fontSize: compact ? 12 : 14,
        }),
      }}
    />
  );
}
