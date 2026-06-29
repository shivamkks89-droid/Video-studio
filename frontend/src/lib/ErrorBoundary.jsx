import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { error: null, info: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    this.setState({ info });
  }

  reset = () => {
    this.setState({ error: null, info: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error?.message || String(this.state.error);
    return (
      <div data-testid="error-boundary" className="min-h-screen bg-[#0A0A0B] text-white p-6 grid place-items-center">
        <div className="surface rounded-2xl p-8 max-w-lg w-full">
          <div className="label-mono text-[#E2FF3D] mb-3">/ SOMETHING BROKE</div>
          <h1 className="text-2xl font-semibold tracking-tight mb-3">We hit a snag rendering this page.</h1>
          <p className="text-sm text-zinc-400 mb-4">
            This is usually a stale token or one corrupted project. Try these in order:
          </p>
          <ol className="text-sm text-zinc-300 space-y-2 list-decimal pl-5 mb-6">
            <li>Reload the page</li>
            <li>Log out and log back in</li>
            <li>Open in an incognito tab</li>
          </ol>
          <div className="bg-[#0A0A0B] border border-white/10 rounded-lg p-3 text-[11px] font-mono text-zinc-400 mb-4 break-words">
            {msg.slice(0, 400)}
          </div>
          <div className="flex gap-2">
            <button onClick={this.reset} className="btn-volt rounded-full px-4 py-2 text-sm">Reload</button>
            <a href="/" className="rounded-full surface px-4 py-2 text-sm">Home</a>
          </div>
        </div>
      </div>
    );
  }
}
