import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import logo from '../../assets/FPL_analytics_logo.png';
import AppNavigation from './AppNavigation';
import AccountMenu from './AccountMenu';
import Button from '../ui/Button';

function Brand({ compact = false }) {
  return <Link to="/My_Team" className="app-brand" aria-label="FPL Analytics home">
    <img src={logo} alt="" width="40" height="40" />
    <span><strong>FPL Analytics</strong>{!compact && <small>Analysis &amp; optimization</small>}</span>
  </Link>;
}

function MobileDrawer({ open, onClose, returnFocusRef }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus({ preventScroll: true });
    }
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [open, returnFocusRef]);
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia('(min-width: 1280px)');
    const onResize = () => { if (media.matches) onClose(); };
    media.addEventListener('change', onResize);
    return () => media.removeEventListener('change', onResize);
  }, [open, onClose]);
  return <dialog ref={dialogRef} className="app-drawer" aria-label="Navigation"
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="app-drawer__content">
      <div className="app-drawer__header"><Brand compact />
        <Button size="icon" aria-label="Close navigation" onClick={onClose}><X size={20} aria-hidden="true" /></Button>
      </div>
      <p className="app-drawer__label">Explore FPL Analytics</p>
      <AppNavigation mobile />
      <p className="app-drawer__footer">Your models, analysis and plans in one place.</p>
    </div>
  </dialog>;
}

function HeaderContent() {
  const [open, setOpen] = useState(false);
  const menuTriggerRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <header className="app-header">
      <div className="app-header__inner">
        <Brand />
        <div className="app-header__desktop"><AppNavigation /></div>
        <div className="app-header__actions">
          <AccountMenu />
          <Button ref={menuTriggerRef} aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={open}
            onClick={() => setOpen(true)} className="app-header__menu">
            <Menu size={19} aria-hidden="true" /><span>Menu</span>
          </Button>
        </div>
      </div>
    </header>
    <MobileDrawer open={open} onClose={close} returnFocusRef={menuTriggerRef} />
  </>;
}

export default function AppHeader() {
  const { pathname } = useLocation();
  return <HeaderContent key={pathname} />;
}
