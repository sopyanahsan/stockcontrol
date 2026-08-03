'use client'

import { useEffect, useState } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { ArrowDown, Check, Loader2 } from 'lucide-react'
import { getGuide } from '@/lib/help/registry'
import GuideHeader from '@/components/help/GuideHeader'
import GuideSection from '@/components/help/GuideSection'
import GuideFooter from '@/components/help/GuideFooter'
import FlowDiagram from '@/components/help/FlowDiagram'
import TipsCard from '@/components/help/TipsCard'
import RelatedPages from '@/components/help/RelatedPages'

// Generic list-item card used by the optional list sections (tabs, metrics,
// filters, columns, actions, ...). Renders only the fields that are present.
function GuideListItem({ item }) {
  const title = item.title || item.name || item.tab || item.label
  if (!title) return null

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      {item.group && (
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{item.group}</div>
      )}
      <div className="text-xs font-medium text-gray-800">{title}</div>
      {item.description && <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{item.description}</p>}
      {item.source && (
        <div className="mt-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Source</div>
          <div className="mt-0.5 rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-700">{item.source}</div>
        </div>
      )}
      {item.formula && (
        <div className="mt-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Formula</div>
          <div className="mt-0.5 rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-700">{item.formula}</div>
        </div>
      )}
      {Array.isArray(item.includes) && item.includes.length > 0 && (
        <div className="mt-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Includes</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {item.includes.map((inc, j) => (
              <span key={j} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{inc}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GuideListSection({ title, items = [] }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <GuideSection title={title}>
      <div className="space-y-3">
        {items.map((item, i) => (
          <GuideListItem key={i} item={item} />
        ))}
      </div>
    </GuideSection>
  )
}

export default function HelpDrawer({ pageId, open, onOpenChange }) {
  const [guide, setGuide] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | empty

  // Automatically loads the guide from the registry every time the drawer opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus('loading')
    setGuide(null)
    getGuide(pageId).then((g) => {
      if (cancelled) return
      setGuide(g)
      setStatus(g ? 'ready' : 'empty')
    })
    return () => {
      cancelled = true
    }
  }, [open, pageId])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="sr-only">{guide?.title || pageId}</SheetTitle>
        </SheetHeader>

        {status === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat panduan...
          </div>
        )}

        {status === 'empty' && <div className="text-xs text-gray-500">Panduan belum tersedia.</div>}

        {status === 'ready' && guide && (
          <>
            <GuideHeader guide={guide} />

            <div className="mt-4 space-y-6">
              <GuideSection title="What is this page?">
                <p>{guide.description}</p>
              </GuideSection>

              {Array.isArray(guide.prerequisites) && guide.prerequisites.length > 0 && (
                <GuideSection title="Prerequisites">
                  <ul className="list-disc space-y-1.5 pl-4">
                    {guide.prerequisites.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </GuideSection>
              )}

              {Array.isArray(guide.workflow) && guide.workflow.length > 0 && (
                <GuideSection title="Workflow">
                  <FlowDiagram items={guide.workflow} />
                </GuideSection>
              )}

              <GuideListSection title="Stock Tabs" items={guide.stockTabs} />
              <GuideListSection title="Filters" items={guide.stockFilters} />
              <GuideListSection title="Columns" items={guide.stockColumns} />
              <GuideListSection title="Ledger Columns" items={guide.stockLedgerColumns} />
              <GuideListSection title="Actions" items={guide.stockActions} />

              <GuideListSection title="Report Tabs" items={guide.reportTabs} />
              <GuideListSection title="Metrics" items={guide.reportMetrics} />
              <GuideListSection title="Charts" items={guide.reportCharts} />
              <GuideListSection title="Report Filters" items={guide.reportFilters} />
              <GuideListSection title="Tables" items={guide.reportTables} />
              <GuideListSection title="Report Actions" items={guide.reportActions} />

              <GuideListSection title="Receiving Resolution" items={guide.receivingResolution} />

              {Array.isArray(guide.documentStatus) && guide.documentStatus.length > 0 && (
                <GuideSection title="Document Status">
                  <ol className="space-y-0">
                    {guide.documentStatus.map((step, i) => (
                      <li key={i}>
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                          <div className="text-xs font-medium text-gray-800">{step.label}</div>
                          {step.description && <div className="mt-0.5 text-[12px] text-gray-500">{step.description}</div>}
                        </div>
                        {i < guide.documentStatus.length - 1 && (
                          <div className="flex justify-center py-0.5 text-gray-300">
                            <ArrowDown className="h-4 w-4" />
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </GuideSection>
              )}

              {Array.isArray(guide.validationChecklist) && guide.validationChecklist.length > 0 && (
                <GuideSection title="Validation Checklist">
                  <ul className="space-y-1.5">
                    {guide.validationChecklist.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-gray-700">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </GuideSection>
              )}

              {Array.isArray(guide.whenToUse) && guide.whenToUse.length > 0 && (
                <GuideSection title="When To Use">
                  <ul className="list-disc space-y-1.5 pl-4">
                    {guide.whenToUse.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </GuideSection>
              )}

              {Array.isArray(guide.bestPractices) && guide.bestPractices.length > 0 && (
                <GuideSection title="Best Practice">
                  <ul className="list-disc space-y-1.5 pl-4">
                    {guide.bestPractices.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </GuideSection>
              )}

              {Array.isArray(guide.commonMistakes) && guide.commonMistakes.length > 0 && (
                <GuideSection title="Common Mistakes">
                  <ul className="list-disc space-y-1.5 pl-4">
                    {guide.commonMistakes.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </GuideSection>
              )}

              {Array.isArray(guide.dashboardMetrics) && guide.dashboardMetrics.length > 0 && (
                <GuideSection title="Dashboard Metrics">
                  <div className="space-y-3">
                    {guide.dashboardMetrics.map((metric, i) => (
                      <div key={i} className="rounded-md border border-gray-200 bg-white p-3">
                        <div className="text-xs font-medium text-gray-800">{metric.title}</div>
                        {metric.description && <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{metric.description}</p>}
                        {metric.formula && (
                          <div className="mt-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Formula</div>
                            <div className="mt-0.5 rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-700">{metric.formula}</div>
                          </div>
                        )}
                        {Array.isArray(metric.affectedBy) && metric.affectedBy.length > 0 && (
                          <div className="mt-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Affected By</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {metric.affectedBy.map((item, j) => (
                                <span key={j} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{item}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {metric.notes && <p className="mt-1.5 text-[11px] italic text-gray-400">{metric.notes}</p>}
                      </div>
                    ))}
                  </div>
                </GuideSection>
              )}

              <TipsCard tips={guide.tips} />
              <RelatedPages pageIds={guide.relatedPages} />
            </div>

            <GuideFooter guide={guide} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
