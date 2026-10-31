import { Sparkles, Target } from 'lucide-react';
import SectionLayout from '../../components/layout/SectionLayout';

const tabs = [
  { to: 'My_Team', label: 'Optimize', icon: Target, end: true },
  { to: 'Chip_Team', label: 'AI Chip Team', icon: Sparkles, end: true, compactLabel: 'Chip' },
];

export default function OptimizerLayout() {
  return <SectionLayout tabs={tabs} docked />;
}
