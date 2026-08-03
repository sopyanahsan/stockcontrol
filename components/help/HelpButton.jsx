'use client'

import { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getGuideLabel } from '@/lib/help/registry'
import HelpDrawer from '@/components/help/HelpDrawer'

export default function HelpButton({ pageId, className }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Bantuan: ${getGuideLabel(pageId)}`}
        onClick={() => setOpen(true)}
        className={cn(
          'h-8 w-8 rounded-full border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600',
          className
        )}
      >
        <CircleHelp className="h-4 w-4" />
      </Button>
      <HelpDrawer pageId={pageId} open={open} onOpenChange={setOpen} />
    </>
  )
}
