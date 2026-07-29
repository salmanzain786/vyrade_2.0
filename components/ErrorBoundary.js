'use client';

/**
 * Client error boundary (milestone 1.4).
 *
 * A UI crash in one region (chat, blueprint sheet, workflow modal) should report
 * to Sentry and show a small recoverable fallback — NOT white-screen the whole
 * app. Only the error + React component stack are sent (no props, no state, no
 * Blueprint content), so nothing sensitive leaves the browser.
 */
import { Component } from 'react';
import * as Sentry from '@sentry/nextjs';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    Sentry.captureException(error, {
      tags: { boundary: this.props.name || 'ui' },
      contexts: { react: { componentStack: info?.componentStack } },
    });
  }

  reset() {
    this.setState({ hasError: false });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div
        role="alert"
        className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground"
      >
        <p className="font-medium text-foreground">Something went wrong here.</p>
        <p className="mt-1">This section failed to render. The rest of the app is unaffected.</p>
        <button
          onClick={this.reset}
          className="mt-3 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Try again
        </button>
      </div>
    );
  }
}
