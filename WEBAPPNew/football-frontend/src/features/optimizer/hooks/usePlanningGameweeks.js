import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../config/apiBase';
import { nextPlanningGameweek } from '../../../utils/planningGameweeks';

export default function usePlanningGameweeks(loadedTeamGw) {
  const [planningEvents, setPlanningEvents] = useState(null);
  const [planningError, setPlanningError] = useState('');
  const firstPlanningGw = planningEvents !== null ? nextPlanningGameweek(planningEvents)
    : Number.isInteger(loadedTeamGw) && loadedTeamGw >= 1 && loadedTeamGw <= 38 ? loadedTeamGw : null;

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/Planning_Events`, { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load current gameweeks.');
        const events = await response.json();
        if (!Array.isArray(events)) throw new Error('Invalid gameweek data.');
        if (!controller.signal.aborted) { setPlanningEvents(events); setPlanningError(''); }
      } catch (error) {
        if (!controller.signal.aborted) setPlanningError(error.message);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return { planningEvents, planningError, firstPlanningGw };
}
