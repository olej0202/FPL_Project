import { useCallback, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { isNavigationActive, mainNavigation } from '../../app/navigation';
import useDismissableLayer from '../../hooks/useDismissableLayer';
import { classNames } from '../ui/classNames';

function NavigationGroup({ item, mobile }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissableLayer({ open, onClose: close, containerRef, triggerRef });
  const Icon = item.icon;
  const id = mobile ? 'mobile-analysis-links' : 'desktop-analysis-links';
  return (
    <div className="app-nav__group" ref={containerRef}>
      <button ref={triggerRef} type="button" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(value => !value)}
        className={classNames('app-nav__link', isNavigationActive(item, pathname) && 'is-active')}>
        <Icon size={17} aria-hidden="true" /><span>{item.label}</span>
        <ChevronDown size={15} aria-hidden="true" className={open ? 'rotate-180' : ''} />
      </button>
      {open && <div id={id} className="app-nav__submenu">
        {item.children.map(child => <NavLink key={child.to} to={child.to}
          className={({ isActive }) => classNames('app-nav__sublink', isActive && 'is-active')}>
          {child.label}
        </NavLink>)}
      </div>}
    </div>
  );
}

export default function AppNavigation({ mobile = false }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label={mobile ? 'Mobile main navigation' : 'Main navigation'} className={classNames('app-nav', mobile && 'app-nav--mobile')}>
      {mainNavigation.map(item => {
        if (item.children) return <NavigationGroup key={`${item.label}:${pathname}`} item={item} mobile={mobile} />;
        const Icon = item.icon;
        return <NavLink key={item.to} to={item.to}
          className={classNames('app-nav__link', isNavigationActive(item, pathname) && 'is-active')}>
          <Icon size={17} aria-hidden="true" /><span>{item.label}</span>
        </NavLink>;
      })}
    </nav>
  );
}
