// ============================================================
// ReportLayout — wrapper for report section pages
// Wraps content inside AppShell with page header + filter slot
// ============================================================

import AppShell from '@/components/app-shell'
import { ReportHeader } from './ReportHeader'

/**
 * <ReportLayout
 *   title        = "Stock on Hand"
 *   subtitle    = "Current inventory by item and location"
 *   actions    = <div />   // right-aligned header actions
 *   filters    = <div />   // filter bar rendered below header
 *   children              // report content
 * />
 */
export function ReportLayout({ title, subtitle, actions, filters, children }) {
  return (
    <AppShell title={title} subtitle={subtitle} actions={actions}>
      {filters && <div className="mb-4">{filters}</div>}
      {children}
    </AppShell>
  )
}
