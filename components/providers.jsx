'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Singleton QueryClient — created once at module load, never recreated
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15000 },
  },
})

export default function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
