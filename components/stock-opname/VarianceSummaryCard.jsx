import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Package, AlertTriangle } from 'lucide-react'

const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

export function VarianceSummaryCard({ summary }) {
  if (!summary) return null

  const { totalItems, countedItems, matched, variance, missing, over, accuracy } = summary

  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
          <Package className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Total Items</div>
          <div className="text-sm font-semibold tabular-nums">{fmt(totalItems)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <CheckCircle2 className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Counted</div>
          <div className="text-sm font-semibold tabular-nums">{fmt(countedItems)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-600">
          <CheckCircle2 className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Matched</div>
          <div className="text-sm font-semibold tabular-nums text-green-600">{fmt(matched)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <AlertTriangle className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Variance</div>
          <div className="text-sm font-semibold tabular-nums text-orange-600">{fmt(variance)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
          <XCircle className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Missing</div>
          <div className="text-sm font-semibold tabular-nums text-red-500">{fmt(missing)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
          <TrendingUp className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Over</div>
          <div className="text-sm font-semibold tabular-nums text-blue-500">{fmt(over)}</div>
        </div>
      </div>

      <div className="col-span-2 flex items-center gap-2.5 sm:col-span-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
          <TrendingUp className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-[11px] text-gray-500">Accuracy</div>
          <div className="text-sm font-semibold tabular-nums text-purple-600">
            {accuracy != null ? `${accuracy.toFixed(2)}%` : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
