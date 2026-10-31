import { useEffect, useRef } from 'react';
import { matchRoutes, useLocation } from 'react-router-dom';
import { navigationTitle } from '../../app/navigation';
import { routeDefinitions } from '../../app/routeDefinitions';
import AppHeader from './AppHeader';

export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const fullWidth = matchRoutes(routeDefinitions, pathname)?.some(({ route }) => route.fullWidth);
  const mainRef = useRef(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    document.title = `${navigationTitle(pathname)} · FPL Analytics`;
    if (previousPath.current !== pathname) mainRef.current?.focus({ preventScroll: true });
    previousPath.current = pathname;
  }, [pathname]);
  return <div className="app-shell bg-app-gradient">
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault(); mainRef.current?.focus(); mainRef.current?.scrollIntoView();
    }}>Skip to content</a>
    <AppHeader />
    <main ref={mainRef} id="main-content" tabIndex={-1} className={`app-content${fullWidth ? ' app-content--full-width' : ''}`}>
      <div className="app-content__surface">{children}</div>
    </main>
  </div>;
}
