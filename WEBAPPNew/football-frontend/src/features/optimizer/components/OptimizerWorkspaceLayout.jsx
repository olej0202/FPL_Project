import { lazy, Suspense, useId, useRef, useState } from 'react';
import { ChartNoAxesCombined, GitBranch, Users } from 'lucide-react';
import LoadingState from '../../../components/ui/LoadingState';
import ErrorBoundary from '../../../components/ui/ErrorBoundary';
import CurrentlyUnavailable from '../../../components/CurrentlyUnavailable';
import { isSiteAvailable } from '../../../config/siteAvailability';
import './optimizerSplitWorkspace.css';

const PlayerPredictions = lazy(() => import('../../ai-model/pages/PlayerRankingsPage'));
const panels = [
  { id: 'optimization', label: 'Optimization', icon: GitBranch },
  { id: 'predictions', label: 'AI predictions', icon: ChartNoAxesCombined },
];
const mobileViews = [
  { id: 'pitch', label: 'Pitch', icon: Users },
  { id: 'optimization', label: 'Optimization', icon: GitBranch },
];

export function SquadPitchLayout({ splitView, navigation, allTransfers, settings, selectedTransfers, pitch }) {
  if (!splitView) return <>{navigation}{allTransfers}{settings}{selectedTransfers}{pitch}</>;
  return <>
    <div className="pitch-view__settings">{settings}</div>
    {pitch}
    {selectedTransfers}
    {allTransfers}
  </>;
}

function SplitWorkspace({ header, optimization, squad, action }) {
  const id = useId();
  const mobileSwitchRef = useRef(null);
  const [mobileView, setMobileView] = useState('pitch');
  const [activePanel, setActivePanel] = useState('optimization');
  const [predictionsOpened, setPredictionsOpened] = useState(false);
  const selectMobileView = view => {
    setMobileView(view);
    requestAnimationFrame(() => mobileSwitchRef.current?.scrollIntoView({ block: 'start' }));
  };
  const selectPanel = panel => {
    setActivePanel(panel);
    if (panel === 'predictions') setPredictionsOpened(true);
  };
  const handleTabKey = event => {
    const offset = { ArrowRight: 1, ArrowLeft: -1, Home: 0, End: panels.length - 1 }[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const index = panels.findIndex(panel => panel.id === activePanel);
    const next = event.key === 'Home' || event.key === 'End'
      ? offset : (index + offset + panels.length) % panels.length;
    selectPanel(panels[next].id);
    event.currentTarget.querySelectorAll('[role="tab"]')[next].focus();
  };

  return (
    <div className="optimizer-test-workspace" data-mobile-view={mobileView}>
      {header}
      <div ref={mobileSwitchRef} className="optimizer-test-workspace__mobile-switch" role="group" aria-label="Optimizer view">
        {mobileViews.map(({ id: view, label, icon: Icon }) => (
          <button key={view} type="button" aria-pressed={mobileView === view}
            aria-controls={`${id}-${view}-view`} onClick={() => selectMobileView(view)}>
            <Icon size={18} aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      <div className="optimizer-test-workspace__grid">
        <section id={`${id}-pitch-view`} className="optimizer-test-workspace__team" aria-label="Team display" tabIndex={0}>
          {squad}
        </section>
        <section id={`${id}-optimization-view`} className="optimizer-test-workspace__tools" aria-label="Optimization and predictions">
          <div className="optimizer-test-workspace__tabs" role="tablist" aria-label="Workspace panel" onKeyDown={handleTabKey}>
            {panels.map(({ id: panel, label, icon: Icon }) => (
              <button key={panel} type="button" role="tab" id={`${id}-${panel}-tab`}
                aria-controls={`${id}-${panel}-panel`} aria-selected={activePanel === panel}
                tabIndex={activePanel === panel ? 0 : -1} onClick={() => selectPanel(panel)}>
                <Icon size={17} aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          <div className="optimizer-test-workspace__panel" role="tabpanel" id={`${id}-optimization-panel`}
            aria-labelledby={`${id}-optimization-tab`} hidden={activePanel !== 'optimization'}>
            <div className="optimizer-test-workspace__scroll" tabIndex={0} aria-label="Optimization controls">
              {optimization}
            </div>
            <div className="optimizer-test-workspace__action">{action}</div>
          </div>
          <div className="optimizer-test-workspace__panel" role="tabpanel" id={`${id}-predictions-panel`}
            aria-labelledby={`${id}-predictions-tab`} hidden={activePanel !== 'predictions'}>
            <div className="optimizer-test-workspace__scroll" tabIndex={0} aria-label="AI player predictions">
              {predictionsOpened && (isSiteAvailable('playerAnalyticsRankings')
                ? <ErrorBoundary><Suspense fallback={<LoadingState label="Loading AI predictions" />}><PlayerPredictions embedded /></Suspense></ErrorBoundary>
                : <CurrentlyUnavailable title="AI player predictions" />)}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function OptimizerWorkspaceLayout({ splitView = false, header, optimization, squad, action }) {
  if (splitView) return <SplitWorkspace header={header} optimization={optimization} squad={squad} action={action} />;
  return <div className="mx-auto max-w-7xl px-1 py-3 sm:px-2 sm:py-5">{header}{optimization}{squad}{action}</div>;
}
