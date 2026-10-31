import { User } from 'lucide-react';
import SectionLayout from '../../components/layout/SectionLayout';

const tabs = [
  { to: 'Individual', label: 'Individual Player', icon: User, end: true },
];

export default function PlayerAnalyticsLayout() {
  return <SectionLayout tabs={tabs} title="Player Analytics" description="Explore individual players and their performance." icon={User} />;
}
