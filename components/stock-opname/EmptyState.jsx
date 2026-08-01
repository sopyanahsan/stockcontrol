import { ClipboardList } from 'lucide-react'

export function EmptyState({ icon: Icon = ClipboardList, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <Icon className="h-6 w-6 text-gray-400" />
      </div>
      <div className="text-sm font-medium text-gray-600">{title || 'No data found'}</div>
      {description && <div className="text-xs text-gray-400">{description}</div>}
    </div>
  )
}
