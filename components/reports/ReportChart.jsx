// ============================================================
// ReportChart — Recharts wrapper with consistent report styling
// Generic: accepts chartType, data, and chart-specific props
// Reuses existing Recharts components
// ============================================================

import { cn } from '@/lib/utils'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

const CHART_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d']

const defaultTooltipStyle = {
  contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb', backgroundColor: '#fff' },
  labelStyle: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
}

const gridProps = { strokeDasharray: '3 3', stroke: '#f0f0f0', vertical: false }
const axisBase = { axisLine: false, tickLine: false, tick: { fontSize: 11 } }

/**
 * <ReportChart
 *   type    = 'bar' | 'line' | 'area' | 'pie'
 *   data    = []
 *   bars    = [{dataKey, name, color?}]
 *   xKey    = 'date'
 *   height  = 240
 *   className
 * />
 */
export function ReportChart({
  type = 'bar',
  data = [],
  bars = [],
  xKey = 'date',
  height = 240,
  className,
  showGrid = true,
  showLegend = false,
  showTooltip = true,
}) {
  if (!data.length) return null

  const renderBars = () =>
    bars.map((bar, i) => {
      const color = bar.color || CHART_COLORS[i % CHART_COLORS.length]
      if (type === 'bar') return <Bar key={bar.dataKey} dataKey={bar.dataKey} name={bar.name} fill={color} radius={[3, 3, 0, 0]} maxBarSize={48} />
      if (type === 'line') return <Line key={bar.dataKey} dataKey={bar.dataKey} name={bar.name} stroke={color} strokeWidth={2} dot={false} />
      if (type === 'area') return <Area key={bar.dataKey} type="monotone" dataKey={bar.dataKey} name={bar.name} stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} />
      return null
    })

  const commonProps = {
    ...(showGrid ? { ...gridProps, vertical: false } : {}),
  }

  const xProps = { ...axisBase, dataKey: xKey }
  const yProps = { ...axisBase }

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'bar' ? (
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} {...commonProps}>
            <XAxis {...xProps} />
            <YAxis {...yProps} />
            {showTooltip && <Tooltip {...defaultTooltipStyle} />}
            {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {renderBars()}
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} {...commonProps}>
            <XAxis {...xProps} />
            <YAxis {...yProps} />
            {showTooltip && <Tooltip {...defaultTooltipStyle} />}
            {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {renderBars()}
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} {...commonProps}>
            <defs>
              {bars.map((bar, i) => (
                <linearGradient key={bar.dataKey} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={bar.color || CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.12} />
                  <stop offset="95%" stopColor={bar.color || CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <XAxis {...xProps} />
            <YAxis {...yProps} />
            {showTooltip && <Tooltip {...defaultTooltipStyle} />}
            {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {renderBars()}
          </AreaChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  )
}
