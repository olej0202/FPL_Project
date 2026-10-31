import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PitchGameweekNavigation({ gameweek, previousDisabled, nextDisabled, onPrevious, onNext }) {
  return <nav className="pitch-gw-navigation" aria-label="Pitch gameweek navigation">
    <button type="button" aria-label="Previous gameweek" title="Previous GW" disabled={previousDisabled} onClick={onPrevious}>
      <ChevronLeft size={24} aria-hidden="true" />
    </button>
    <span aria-live="polite" aria-atomic="true">GW {gameweek}</span>
    <button type="button" aria-label="Next gameweek" title="Next GW" disabled={nextDisabled} onClick={onNext}>
      <ChevronRight size={24} aria-hidden="true" />
    </button>
  </nav>;
}
