import './globals.css'
import Providers from '@/components/providers'
import { ToasterWrapper } from '@/components/toaster-wrapper'

export const metadata = {
  title: 'StockControl WMS',
  description: 'Enterprise Stock Control Inventory System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900 antialiased" suppressHydrationWarning>
        <Providers>
          {children}
          <ToasterWrapper />
        </Providers>
      </body>
    </html>
  )
}

