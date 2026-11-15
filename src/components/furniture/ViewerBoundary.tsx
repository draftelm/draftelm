"use client";

import { Component } from "react";
import type { ReactNode } from "react";

/** Keep the specification, component list and BOM available if WebGL initialization fails. */
export default class ViewerBoundary extends Component<{ children: ReactNode; onFailure?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure?.(); }
  render() {
    if (this.state.failed) return (
      <div role="alert" className="p-8 text-sm text-amber-200">
        <p>The 3D viewer could not start. Components and the BOM remain available.</p>
        <button type="button" className="mt-4 rounded border border-amber-300/40 px-4 py-2" onClick={() => this.setState({ failed: false })}>Retry viewer</button>
      </div>
    );
    return this.props.children;
  }
}
