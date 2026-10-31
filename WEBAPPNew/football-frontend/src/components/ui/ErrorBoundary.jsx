import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import EmptyState from './EmptyState';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) { console.error('Page could not be displayed:', error, info); }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return <EmptyState icon={AlertTriangle} title="This page could not be loaded"
        description="Your saved plans are still available. Refresh the page to try again, or choose another section."
        actionLabel="Refresh page" onAction={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
