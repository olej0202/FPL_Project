import { useCallback, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock3, LogOut, Settings, UserCircle2 } from 'lucide-react';
import { useUserData } from '../../Contexts/UserContext';
import { useMyteamData } from '../../Contexts/MyTeamContext';
import useDismissableLayer from '../../hooks/useDismissableLayer';
import Button from '../ui/Button';

function AccountMenuContent() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const navigate = useNavigate();
  const { provider, user, recentTeamIds, logout } = useUserData();
  const { setTeamId } = useMyteamData();
  useDismissableLayer({ open, onClose: close, containerRef, triggerRef });

  const applyTeam = (id) => {
    if (id == null) return;
    setTeamId(String(id));
    close();
    navigate('/My_Team');
  };

  return <div className="account-menu" ref={containerRef}>
    <Button ref={triggerRef} aria-label="Settings" aria-expanded={open} aria-controls="account-settings"
      onClick={() => setOpen(value => !value)} className="account-menu__trigger">
      <Settings size={17} aria-hidden="true" /><span>Settings</span>
    </Button>
    {open && <section id="account-settings" className="account-menu__panel" aria-label="Account settings">
      <div className="account-menu__identity">
        <UserCircle2 size={27} className="text-emerald-700 shrink-0" aria-hidden="true" />
        <div className="min-w-0"><p className="truncate font-bold text-slate-900">{user?.name || 'Session'}</p>
          <p className="truncate text-xs text-slate-500">{provider === 'google' ? user?.email || 'Google account' : 'Guest mode'}</p>
        </div>
      </div>
      <h2 className="account-menu__label"><Clock3 size={14} aria-hidden="true" />Recent Team IDs</h2>
      {Array.isArray(recentTeamIds) && recentTeamIds.length ? <div className="account-menu__teams">
        {recentTeamIds.map(id => <Button key={id} className="justify-start w-full" onClick={() => applyTeam(id)}>Team ID {id}</Button>)}
      </div> : <p className="text-sm text-slate-500 py-2">No recent team IDs yet.</p>}
      <Button variant="danger" onClick={logout} className="w-full mt-4"><LogOut size={16} aria-hidden="true" />Log out</Button>
    </section>}
  </div>;
}

export default function AccountMenu() {
  const { pathname } = useLocation();
  return <AccountMenuContent key={pathname} />;
}
