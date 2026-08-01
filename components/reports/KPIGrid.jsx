// ============================================================
// KPIGrid — Responsive grid of SummaryCards
// Generic: accepts array of card props
// ============================================================

import { SummaryCard, defaultAccents } from './SummaryCard'
import { cn } from '@/lib/utils'

/**
 * <KPIGrid items={[
 *   { icon: Package, label: 'Total Units', value: 1234, sub: 'across all locations' },
 *   { icon: DollarSign, label: 'Inventory Value', value: '$45,000', sub: 'at standard cost', accent: 'green' },
 * ]} />
 *
 * @param {object} props
 * @param {Array} props.items  — array of SummaryCard props
 * @param {string} [props.className]
 * @param {number} [props.cols] — grid cols (default 2 on mobile, 4 on lg)
 */
export function KPIGrid({ items = [], className, cols }) {
  return (
    <div className={cn('grid gap-3', cols ? `grid-cols-${cols}` : 'grid-cols-2 lg:grid-cols-4', className)}>
      {items.map((item, i) => (
        <SummaryCard
          key={i}
          {...item}
          accent={item.accent || defaultAccents[i % defaultAccents.length]}
        />
      ))}
    </div>
  )
}
