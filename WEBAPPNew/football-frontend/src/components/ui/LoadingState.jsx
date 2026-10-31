import { LoaderCircle } from 'lucide-react';

export default function LoadingState({ label = 'Loading page…', fullScreen = false }) {
  return (
    <div className={fullScreen ? 'loading-state loading-state--fullscreen' : 'loading-state'} role="status" aria-live="polite">
      <LoaderCircle className="loading-state__spinner" size={26} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
