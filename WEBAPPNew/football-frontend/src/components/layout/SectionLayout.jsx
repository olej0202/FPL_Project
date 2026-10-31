import { Outlet } from 'react-router-dom';
import PageHeader from '../ui/PageHeader';
import SectionTabs from './SectionTabs';

export default function SectionLayout({ title, description, icon, tabs, docked = false, children }) {
  return (
    <div className={docked ? 'section-layout section-layout--docked' : 'section-layout'}>
      {title && <PageHeader title={title} description={description} icon={icon} />}
      {tabs && <SectionTabs items={tabs} label={`${title || 'Section'} navigation`} docked={docked} />}
      {children}
      <Outlet />
    </div>
  );
}
