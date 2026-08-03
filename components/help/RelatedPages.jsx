'use client'

import GuideSection from '@/components/help/GuideSection'
import { getGuideLabel } from '@/lib/help/registry'

export default function RelatedPages({ pageIds = [] }) {
  if (!Array.isArray(pageIds) || pageIds.length === 0) return null

  return (
    <GuideSection title="Halaman Terkait">
      <div className="flex flex-wrap gap-1.5">
        {pageIds.map((id) => (
          <span
            key={id}
            className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-600"
          >
            {getGuideLabel(id)}
          </span>
        ))}
      </div>
    </GuideSection>
  )
}
