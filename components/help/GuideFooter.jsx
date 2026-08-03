'use client'

import { Button } from '@/components/ui/button'
import { BookOpen } from 'lucide-react'

export default function GuideFooter({ guide }) {
  if (!guide) return null

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <Button type="button" size="sm" className="h-9 w-full bg-blue-600 text-xs hover:bg-blue-700">
        <BookOpen className="mr-2 h-4 w-4" />
        Open Full Guide
      </Button>
    </div>
  )
}
