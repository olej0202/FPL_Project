import { CalendarDays, PlayCircle, User, Users } from 'lucide-react';
import SectionLayout from '../../components/layout/SectionLayout';
import ScenarioManager from './components/ScenarioManager';

const tabs = [
  { to: 'Adjustment_Player', label: 'Players', icon: User, end: true },
  { to: 'Adjustment_Teams', label: 'Teams', icon: Users },
  { to: 'Adjustment_Fixture', label: 'Fixtures', compactLabel: 'Fixtures', icon: CalendarDays },
  { to: 'Adjustment_Simulator', label: 'Simulator', compactLabel: 'Sim', icon: PlayCircle },
];

export default function StatisticalModelLayout() {
  return <SectionLayout tabs={tabs} docked><ScenarioManager /></SectionLayout>;
}
