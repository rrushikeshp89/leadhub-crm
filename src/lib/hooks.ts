import { useCallback } from 'react'
import { formatMoney } from '../../shared/calc'
import { useStore } from '../store/Store'

/** Currency formatter bound to the organisation's currency (₹12,00,000 for INR) */
export function useMoney() {
  const { db } = useStore()
  const currency = db.settings.currency
  return useCallback((n: number | null | undefined, compact = false) => formatMoney(n, currency, compact), [currency])
}
