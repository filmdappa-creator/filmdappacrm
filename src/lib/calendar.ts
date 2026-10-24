// ============================================================================
// Filmdappa CRM — Financial Calendar: October 2026 to December 2030 (51 Months)
// ============================================================================

export interface MonthOption {
  key: string // e.g. "2026-10"
  label: string // e.g. "October 2026"
  monthName: string // e.g. "October"
  shortMonth: string // e.g. "Oct"
  year: number // e.g. 2026
  monthIndex: number // 0-indexed (9 for October)
  startDate: string // "2026-10-01"
  endDate: string // "2026-10-31"
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function generate51Months(): MonthOption[] {
  const result: MonthOption[] = []
  // From October 2026 to December 2030
  for (let y = 2026; y <= 2030; y++) {
    const startM = y === 2026 ? 9 : 0
    const endM = 11
    for (let m = startM; m <= endM; m++) {
      const monthNum = String(m + 1).padStart(2, '0')
      const days = getDaysInMonth(y, m)
      result.push({
        key: `${y}-${monthNum}`,
        label: `${MONTH_NAMES[m]} ${y}`,
        monthName: MONTH_NAMES[m],
        shortMonth: SHORT_MONTH_NAMES[m],
        year: y,
        monthIndex: m,
        startDate: `${y}-${monthNum}-01`,
        endDate: `${y}-${monthNum}-${String(days).padStart(2, '0')}`,
      })
    }
  }
  return result
}

export const FINANCIAL_MONTHS: MonthOption[] = generate51Months()
export const INITIAL_MONTH_KEY = '2026-10'
export const MIN_FINANCIAL_DATE = '2026-10-01'
export const MAX_FINANCIAL_DATE = '2030-12-31'

export function getMonthByKey(key: string): MonthOption {
  return (
    FINANCIAL_MONTHS.find((m) => m.key === key) ||
    FINANCIAL_MONTHS[0]
  )
}

export function getPrevMonthKey(currentKey: string): string | null {
  const idx = FINANCIAL_MONTHS.findIndex((m) => m.key === currentKey)
  if (idx <= 0) return null
  return FINANCIAL_MONTHS[idx - 1].key
}

export function getNextMonthKey(currentKey: string): string | null {
  const idx = FINANCIAL_MONTHS.findIndex((m) => m.key === currentKey)
  if (idx === -1 || idx >= FINANCIAL_MONTHS.length - 1) return null
  return FINANCIAL_MONTHS[idx + 1].key
}

export function isValidFinancialDate(dateStr: string): boolean {
  if (!dateStr || dateStr.length < 10) return false
  const dateOnly = dateStr.slice(0, 10)
  return dateOnly >= MIN_FINANCIAL_DATE && dateOnly <= MAX_FINANCIAL_DATE
}

export function dateIsInMonth(dateStr: string, monthKey: string): boolean {
  if (!dateStr) return false
  return dateStr.startsWith(monthKey)
}

export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '—'
  const parts = dateStr.slice(0, 10).split('-')
  if (parts.length !== 3) return dateStr
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr
  return `${d} ${SHORT_MONTH_NAMES[m] || ''} ${y}`
}

export function formatMoney(value: number, currency: string = 'INR'): string {
  const num = Math.round(value || 0)
  const isNegative = num < 0
  const absNum = Math.abs(num)
  const symbol = currency.includes('USD')
    ? '$'
    : currency.includes('EUR')
      ? '€'
      : currency.includes('GBP')
        ? '£'
        : '₹'
  return `${isNegative ? '-' : ''}${symbol}${absNum.toLocaleString('en-IN')}`
}
