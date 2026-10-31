import { BarChart, ChartLine, User } from 'lucide-react';
import SectionLayout from '../../components/layout/SectionLayout';

const tabs = [
  { to: 'Team_Rankings', label: 'Team Rankings', icon: BarChart, end: true },
  { to: 'Team_Individual', label: 'Individual Team', icon: User, end: true },
  { to: 'Team_Analysis', label: 'Team Analysis', icon: ChartLine, end: true },
];

export default function TeamAnalyticsLayout() {
  return <SectionLayout tabs={tabs} title="Team Analytics" description="Compare team form, rankings and individual performance." icon={BarChart} />;
}
