import { parseLook, type CharacterId, type SkinTone } from '@sixtysix/shared'
import type { RunnerColors } from './runner'

/**
 * The runner dressed as your look: a cloak and trim per character (roughly
 * the colours of their painted portrait, Joseph's in red and blue for his
 * coat), and the hands and face in your skin tone.
 */

const CLOAKS: Record<CharacterId, [cloak: string, trim: string]> = {
  david: ['#3456a6', '#b8432f'],
  moses: ['#7a4a2a', '#e2c27a'],
  esther: ['#7b3fa0', '#e7b63e'],
  ruth: ['#c9822b', '#6b8f3a'],
  abraham: ['#8a6a4a', '#2f5f8a'],
  sarah: ['#b5546a', '#e7d0a0'],
  noah: ['#5b7d4a', '#c49a5a'],
  rebekah: ['#2f8a8a', '#d9a441'],
  joseph: ['#c4472f', '#2f6fb8'],
  miriam: ['#d17a3a', '#3a6fa8'],
  deborah: ['#556b2f', '#c9902e'],
  gideon: ['#8b3a2a', '#c9b07a'],
  hannah: ['#4a6fa8', '#e8d3b0'],
  samuel: ['#e8dcc0', '#2f5fae'],
  elijah: ['#6b4a32', '#b88a4a'],
  naomi: ['#6a5a8a', '#c9a76a'],
  daniel: ['#7a2a3a', '#e7b63e'],
  mary: ['#2f5fae', '#f1e6cf'],
  peter: ['#6b7a4a', '#a8653a'],
  john: ['#b8432f', '#e8d3b0'],
  martha: ['#a86a3a', '#4f7a5a'],
  lydia: ['#6b2a7a', '#e7b63e'],
  paul: ['#7a5a3a', '#3a5a7a'],
  priscilla: ['#3a7a6a', '#c46a4a'],
}

const SKIN: Record<SkinTone, string> = { light: '#f2c8a6', olive: '#c98e62', dark: '#7a4a2e' }

export function runnerColors(look: string): RunnerColors {
  const { base, tone } = parseLook(look)
  const [cloak, trim] = CLOAKS[base]
  return { cloak, trim, skin: SKIN[tone] }
}
