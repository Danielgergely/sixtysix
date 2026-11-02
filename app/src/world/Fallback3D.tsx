import { Component, type ReactNode } from 'react'

/** Hands over to the painted 2D scene when the lazy 3D chunk fails to load or throws (CityView, PlotView). */
export class Fallback extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
