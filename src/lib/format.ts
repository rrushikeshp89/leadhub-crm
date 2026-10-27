export const addDays = (date: Date, n: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
export const num = (n: number) => n.toLocaleString('en-US')
export const compact = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n))

/** 04/18/2030 */
export const mdy = (s: string) => {
  const d = parseDate(s)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}
/** May 1, 2024 */
export const longDate = (s: string) => {
  const d = parseDate(s)
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
/** August 1, 2024 */
export const fullDate = (s: string) => {
  const d = parseDate(s)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** "08:00" -> "08:00 am" */
export const time12 = (t: string, upper = false) => {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 === 0 ? 12 : h % 12
  const out = `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`
  return upper ? out.toUpperCase() : out
}

export const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000
  if (diff < 1) return 'just now'
  if (diff < 60) return `${Math.round(diff)} minutes ago`
  if (diff < 60 * 24) return `${Math.round(diff / 60)} hour${Math.round(diff / 60) > 1 ? 's' : ''} ago`
  return `${Math.round(diff / 1440)} days ago`
}

export const nowTime = () =>
  new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export const uid = (p = 'id') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
