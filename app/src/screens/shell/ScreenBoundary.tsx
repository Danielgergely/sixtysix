import { Component, type ReactNode } from 'react'

/**
 * Catches a screen that fails to load or render, so the app never goes white.
 * The usual cause is an old tab after a deploy asking for a file that no
 * longer exists, so the fix offered is a reload.
 */
export class ScreenBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="screen screen-failed">
        <p>This page couldn’t load — the game may have just been updated.</p>
        <button className="btn-play" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
