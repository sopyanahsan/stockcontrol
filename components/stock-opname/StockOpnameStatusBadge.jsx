import { Badge } from '@/components/ui/badge'

const STATUS_META = {
  DRAFT:       { label: 'Draft',       class: 'bg-gray-100 text-gray-600 border-gray-200' },
  IN_PROGRESS: { label: 'In Progress', class: 'bg-blue-100 text-blue-700 border-blue-200' },
  SUBMITTED:   { label: 'Submitted',   class: 'bg-orange-100 text-orange-700 border-orange-200' },
  APPROVED:    { label: 'Approved',  class: 'bg-purple-100 text-purple-700 border-purple-200' },
  COMPLETED:   { label: 'Completed',  class: 'bg-green-100 text-green-700 border-green-200' },
  CANCELLED:   { label: 'Cancelled',  class: 'bg-red-100 text-red-600 border-red-200' },
}

export function StockOpnameStatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, class: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <Badge variant="outline" className={`text-[10px] ${meta.class}`}>
      {meta.label}
    </Badge>
  )
}

export { STATUS_META }
