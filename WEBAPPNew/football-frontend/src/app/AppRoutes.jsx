import { Suspense } from 'react';
import { Link, Navigate, useLocation, useRoutes } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { routeDefinitions } from './routeDefinitions';
import { isSiteAvailable } from '../config/siteAvailability';
import CurrentlyUnavailable from '../components/CurrentlyUnavailable';
import ErrorBoundary from '../components/ui/ErrorBoundary';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

function availableElement({ component: Page, siteKey, title }) {
  return isSiteAvailable(siteKey) ? <Page /> : <CurrentlyUnavailable title={title} />;
}

function buildRoutes(definitions) {
  return definitions.map(definition => ({
    path: definition.path,
    index: definition.index,
    element: definition.redirect ? <Navigate to={definition.redirect} replace /> : availableElement(definition),
    children: definition.children ? buildRoutes(definition.children) : undefined,
  }));
}

function NotFound() {
  return <><EmptyState icon={Compass} title="Page not found" description="Choose a section from the navigation, or return to your team." />
    <div className="flex justify-center pb-8"><Button as={Link} to="/My_Team" variant="primary">Go to your team</Button></div></>;
}

export default function AppRoutes() {
  const { pathname } = useLocation();
  const content = useRoutes([...buildRoutes(routeDefinitions), { path: '*', element: <NotFound /> }]);
  return <ErrorBoundary resetKey={pathname}><Suspense fallback={<LoadingState />}>{content}</Suspense></ErrorBoundary>;
}
