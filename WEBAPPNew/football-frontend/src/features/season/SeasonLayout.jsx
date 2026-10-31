import { CalendarRange, User, Users } from 'lucide-react';
import SectionLayout from '../../components/layout/SectionLayout';

const tabs = [
  { to: 'Season_Players', label: 'Players', icon: User, end: true },
  { to: 'Season_Teams', label: 'Teams', icon: Users, end: true },
  { to: 'Season_Matches', label: 'Matches', icon: CalendarRange, end: true },
];

export default function SeasonLayout() {
  return <SectionLayout tabs={tabs} title="Season Analytics" description="Explore player, team and match performance across the season." icon={CalendarRange} />;
}
