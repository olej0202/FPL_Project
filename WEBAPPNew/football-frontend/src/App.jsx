import { useUserData } from './Contexts/UserContext';
import AppRoutes from './app/AppRoutes';
import usePageActivity from './app/usePageActivity';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/ui/ErrorBoundary';
import LoadingState from './components/ui/LoadingState';
import LoginGate from './components/LoginGate';

export default function App() {
  const { authReady, authBusy, authError, hasSession, loginAsGuest, loginWithGoogleCredential } = useUserData();
  usePageActivity();
  if (!authReady) return <LoadingState fullScreen label="Preparing session..." />;
  if (!hasSession) return <LoginGate authBusy={authBusy} authError={authError}
    onGuestLogin={loginAsGuest} onGoogleCredential={loginWithGoogleCredential} />;
  return <ErrorBoundary><AppShell><AppRoutes /></AppShell></ErrorBoundary>;
}
