import { useEffect, useMemo, useState } from 'react';
import { Check, CopyPlus, Trash2 } from 'lucide-react';
import { BASE_SCENARIO_ID, DEFAULT_SCENARIO_COLOR, SCENARIO_COLOR_PALETTE, useAdjustmentData } from '../../../Contexts/AdjustmentsContext';
import ScenarioSelect from '../../../components/ScenarioSelect';
import Panel from '../../../components/ui/Panel';

export default function ScenarioManager() {
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
<Panel className="scenario-manager">
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
      </Panel>
  );
}
