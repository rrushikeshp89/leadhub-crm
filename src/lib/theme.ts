/** Template palette for places that need a color value (icons, SVG, charts). Mirrors tailwind.config.js. */
export const C = {
  ink: '#242424',
  muted: '#8A8D8E',
  faint: '#A7A9AA',
  line: '#EEF0F2',
  canvas: '#F7F8FA',
  white: '#FFFFFF',
  lavender: '#CFCEFF',
  lavenderLight: '#F1F0FF',
  lavenderInk: '#6E6BD8',
  sun: '#FAE27C',
  sunLight: '#FDF6D8',
  sunInk: '#8A6A00',
  /** yellow icons on a light-yellow tile (template student dashboard) */
  sunIcon: '#E5B800',
  sky: '#C3EBFA',
  skyLight: '#EDF9FD',
  skyAccent: '#4ABDE8',
  pink: '#FF8BD0',
  pinkLight: '#FFEFF9',
  success: '#00997E',
  danger: '#FF414B',
  warn: '#FFAE41',
} as const

/** Chart series colors — the template only ever uses these three, in this order */
export const SERIES = [C.lavender, C.sun, C.sky] as const

export const AXIS_TICK = { fontSize: 12, fill: C.faint } as const
export const GRID_STROKE = C.line
