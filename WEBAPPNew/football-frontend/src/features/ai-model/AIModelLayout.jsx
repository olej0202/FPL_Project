import { CalendarDays, User } from 'lucide-react';
import SectionLayout from '../../components/layout/SectionLayout';

const tabs = [
  { to: 'Players', label: 'Players', icon: User, end: true },
  { to: 'Fixtures', label: 'Fixtures', icon: CalendarDays, end: true },
];

export default function AIModelLayout() {
  return <SectionLayout tabs={tabs} docked />;
}
