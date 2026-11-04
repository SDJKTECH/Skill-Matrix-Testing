import React from "react";

// If any part inside this box crashes while showing on screen, show a short
// message with a Retry button there, instead of a blank page. React allows
// this only in a class component, so this is not a function component.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log for developers only (users do not see it), so we can find the crash.
    console.error(`[ErrorBoundary] ${this.props.label || "A section"} failed to render:`, error, info?.componentStack);
  }

  handleRetry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
          <p className="text-sm font-medium">
            {this.props.label ? `Something went wrong displaying ${this.props.label}.` : "Something went wrong displaying this section."}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
