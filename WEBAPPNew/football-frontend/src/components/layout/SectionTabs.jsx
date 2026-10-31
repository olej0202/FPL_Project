import { NavLink } from 'react-router-dom';
import { classNames } from '../ui/classNames';

export default function SectionTabs({ items, label, docked = false }) {
  return (
    <nav aria-label={label} className={classNames('section-tabs', docked && 'section-tabs--docked')}>
      <div className="section-tabs__items">
        {items.map(({ to, label: text, compactLabel, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => classNames('section-tabs__link', isActive && 'is-active')}>
            {Icon && <Icon size={17} aria-hidden="true" />}
            {compactLabel ? <><span className="section-tabs__full-label">{text}</span><span className="section-tabs__compact-label">{compactLabel}</span></> : <span>{text}</span>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
