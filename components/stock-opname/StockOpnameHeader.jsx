import { StockOpnameStatusBadge } from './StockOpnameStatusBadge'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

function StatusFlow({ status }) {
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-medium text-red-600">
        Cancelled
      </span>
    )
  }
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-medium text-green-700">
        Completed
      </span>
    )
  }

  const steps = [
    { label: 'Draft', status: 'DRAFT' },
    { label: 'In Progress', status: 'IN_PROGRESS' },
    { label: 'Submitted', status: 'SUBMITTED' },
    { label: 'Approved', status: 'APPROVED' },
  ]
  const order = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED']
  const current = order.indexOf(status)

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      {steps.map((s, i) => {
        const isDone = i < current
        const isActive = i === current
        return (
          <div key={s.status} className="flex items-center gap-1">
            <div className={`rounded-full px-2 py-0.5 ${
              isDone ? 'bg-green-100 text-green-700' :
              isActive ? 'bg-amber-100 text-amber-700 font-medium' :
              'bg-gray-100 text-gray-400'
            }`}>
              {s.label}
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
          </div>
        )
      })}
    </div>
  )
}

export function StockOpnameHeader({ data, onAction, loading }) {
  if (!data) return null

  const { opnameNumber, status, remarks, createdBy, startedAt, completedAt, approvedAt, createdAt, lines = [] } = data

  const hasVariance = lines.some((l) => Number(l.diffQty) !== 0)
  const varianceCount = lines.filter((l) => Number(l.diffQty) !== 0).length
  const totalDiff = lines.reduce((s, l) => s + Number(l.diffQty || 0), 0)
  const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0)

  const isDraft = status === 'DRAFT'
  const isInProgress = status === 'IN_PROGRESS'
  const isSubmitted = status === 'SUBMITTED'
  const isApproved = status === 'APPROVED'
  const isCompleted = status === 'COMPLETED'
  const isCancelled = status === 'CANCELLED'

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Left: info */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{opnameNumber}</span>
            <StockOpnameStatusBadge status={status} />
          </div>

          {remarks && (
            <div className="max-w-md text-xs text-gray-500">{remarks}</div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-gray-400">
            <span>Created by {createdBy?.name || 'Unknown'}</span>
            <span>·</span>
            <span>{formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>
            {startedAt && (
              <>
                <span>·</span>
                <span>Started {formatDistanceToNow(new Date(startedAt), { addSuffix: true })}</span>
              </>
            )}
            {approvedAt && (
              <>
                <span>·</span>
                <span>Approved {formatDistanceToNow(new Date(approvedAt), { addSuffix: true })}</span>
              </>
            )}
            {completedAt && (
              <>
                <span>·</span>
                <span>Completed {formatDistanceToNow(new Date(completedAt), { addSuffix: true })}</span>
              </>
            )}
          </div>

          {hasVariance && (isSubmitted || isApproved || isCompleted) && (
            <div className={`mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
              totalDiff > 0
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-red-200 bg-red-50 text-red-600'
            }`}>
              <AlertTriangle className="h-3 w-3" />
              {varianceCount} line(s) with variance · Net: {totalDiff > 0 ? '+' : ''}{fmt(totalDiff)}
            </div>
          )}
        </div>

        {/* Right: flow + actions */}
        <div className="flex flex-col items-end gap-2">
          <StatusFlow status={status} />

          <div className="flex flex-wrap items-center gap-2">
            {isDraft && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-red-600 hover:text-red-700 hover:border-red-200"
                  onClick={() => onAction('cancel')}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </>
            )}

            {isInProgress && (
              <Button
                size="sm"
                className="h-8 bg-green-600 hover:bg-green-700"
                onClick={() => onAction('submit')}
                disabled={loading}
              >
                Submit Count
              </Button>
            )}

            {isSubmitted && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-orange-600 hover:text-orange-700"
                  onClick={() => onAction('reject')}
                  disabled={loading}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="h-8 bg-green-600 hover:bg-green-700"
                  onClick={() => onAction('approve')}
                  disabled={loading}
                >
                  Approve
                </Button>
              </>
            )}

            {(isCompleted || isApproved) && (
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link href="/stock-opname">
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List
                </Link>
              </Button>
            )}

            {isCancelled && (
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link href="/stock-opname">
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to List
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
