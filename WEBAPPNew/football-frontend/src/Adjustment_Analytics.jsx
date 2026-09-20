import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, Check, CopyPlus, PlayCircle, Trash2, User, Users } from "lucide-react";
import {
  BASE_SCENARIO_ID,
  DEFAULT_SCENARIO_COLOR,
  SCENARIO_COLOR_PALETTE,
  useAdjustmentData,
} from "./Contexts/AdjustmentsContext";
import ScenarioSelect from "./components/ScenarioSelect";

const tabClass = ({ isActive }) =>
  [
    "inline-flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[10px] font-semibold leading-tight transition-colors shadow-sm sm:h-12 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
    isActive
      ? "border-sky-300 bg-white text-sky-800"
      : "border-slate-300 bg-white/95 text-slate-700 hover:border-sky-200 hover:bg-white hover:text-sky-700",
  ].join(" ");

export default function AdjustmentAnalytics() {
  const {
    scenarios,
    activeScenarioId,
    switchScenario,
    createScenario,
    renameScenario,
    setScenarioColor,
    deleteScenario,
  } = useAdjustmentData();
  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId) || scenarios[0],
    [activeScenarioId, scenarios]
  );
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(
    SCENARIO_COLOR_PALETTE[scenarios.length % SCENARIO_COLOR_PALETTE.length]
  );
  const [renameValue, setRenameValue] = useState(activeScenario?.name || "");

  useEffect(() => {
    setRenameValue(activeScenario?.name || "");
  }, [activeScenario?.id, activeScenario?.name]);

  const handleCreate = () => {
    createScenario(newName, newColor);
    setNewName("");
    setNewColor(
      SCENARIO_COLOR_PALETTE[(scenarios.length + 1) % SCENARIO_COLOR_PALETTE.length]
    );
  };

  const handleRename = () => {
    if (activeScenarioId !== BASE_SCENARIO_ID) renameScenario(activeScenarioId, renameValue);
  };

  const handleDelete = () => {
    if (activeScenarioId === BASE_SCENARIO_ID) return;
    if (window.confirm(`Delete scenario “${activeScenario?.name || "Scenario"}”?`)) {
      deleteScenario(activeScenarioId);
    }
  };

  return (
    <div className="space-y-4 px-2 py-2 pb-24 text-slate-800 sm:px-3 sm:pb-28">
      <section className="mx-auto w-full max-w-7xl rounded-2xl border border-slate-300 bg-white/95 p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active statistical scenario
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <ScenarioSelect
                scenarios={scenarios}
                value={activeScenarioId}
                onChange={switchScenario}
                className="min-w-[190px]"
                ariaLabel="Active adjustment scenario"
              />

              <label
                className="flex h-10 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-slate-50"
                title="Choose scenario color"
              >
                <input
                  type="color"
                  value={activeScenario?.color || DEFAULT_SCENARIO_COLOR}
                  onChange={(event) => setScenarioColor(activeScenarioId, event.target.value)}
                  className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0"
                  aria-label="Scenario color"
                />
              </label>

              {activeScenarioId !== BASE_SCENARIO_ID && (
                <div className="flex min-w-0 flex-1 gap-2">
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleRename()}
                    maxLength={60}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-sky-400"
                    aria-label="Scenario name"
                  />
                  <button
                    type="button"
                    onClick={handleRename}
                    className="inline-flex h-10 items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-semibold hover:bg-slate-100"
                  >
                    <Check size={15} /> Save name
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-rose-700 hover:bg-rose-100"
                    aria-label="Delete active scenario"
                    title="Delete scenario"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Base is locked against rename/delete. Every new scenario starts as a frozen copy of Base.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-1 sm:min-w-[340px]">
            <label htmlFor="new-scenario-name" className="text-xs font-semibold text-slate-500">
              New scenario
            </label>
            <div className="flex gap-2">
              <label
                className="flex h-10 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-slate-50"
                title="Choose new scenario color"
              >
                <input
                  type="color"
                  value={newColor}
                  onChange={(event) => setNewColor(event.target.value)}
                  className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0"
                  aria-label="New scenario color"
                />
              </label>
              <input
                id="new-scenario-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleCreate()}
                maxLength={60}
                placeholder={`Scenario ${scenarios.length}`}
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-sky-400"
              />
              <button
                type="button"
                onClick={handleCreate}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 text-sm font-semibold text-sky-800 hover:bg-sky-100"
              >
                <CopyPlus size={16} /> Create
              </button>
            </div>
          </div>
        </div>
      </section>

      <Outlet />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-400 bg-slate-200/95 shadow-lg backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-2 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-2 sm:px-4 sm:pt-3">
          <div className="mx-auto flex w-full items-center gap-2">
            <NavLink to="Adjustment_Player" end className={tabClass}>
              <User size={16} />
              Players
            </NavLink>

            <NavLink to="Adjustment_Teams" className={tabClass}>
              <Users size={16} />
              Teams
            </NavLink>

            <NavLink to="Adjustment_Fixture" className={tabClass}>
              <CalendarDays size={16} />
              <span className="hidden sm:inline">Fixtures</span>
              <span className="sm:hidden">Fix</span>
            </NavLink>

            <NavLink to="Adjustment_Simulator" className={tabClass}>
              <PlayCircle size={16} />
              <span className="hidden sm:inline">Simulator</span>
              <span className="sm:hidden">Sim</span>
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  );
}




