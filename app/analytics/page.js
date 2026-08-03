import { redirect } from 'next/navigation'

// /analytics → Executive Dashboard.
export default function AnalyticsIndex() {
  redirect('/analytics/executive')
}
