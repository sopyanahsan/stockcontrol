'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  LayoutDashboard, Package, MapPin, Boxes, ClipboardList, Truck, ArrowRightLeft,
  SlidersHorizontal, CalendarCheck, FileSearch, BarChart3, ChevronsLeft, ChevronsRight,
  Search, LogOut, PackageOpen, Warehouse, ScrollText, Ship,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Master Data',
    items: [
      { href: '/items', label: 'Master Item', icon: Package },
      { href: '/locations', label: 'Warehouse Location', icon: MapPin },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/stock', label: 'Stock on Hand', icon: Boxes },
      { href: '/receiving', label: 'Receiving', icon: Truck },
      { href: '/putaway', label: 'Putaway', icon: PackageOpen },
      { href: '/picking', label: 'Picking', icon: ClipboardList },
      { href: '/packing', label: 'Packing', icon: Package },
      { href: '/shipping', label: 'Shipping', icon: Ship },
      { href: '/movement', label: 'Stock Movement', icon: ArrowRightLeft },
      { href: '/adjustment', label: 'Stock Adjustment', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Inventory Control',
    items: [
      { href: '/cycle-count', label: 'Cycle Count', icon: ClipboardList },
      { href: '/stock-opname', label: 'Stock Opname', icon: CalendarCheck },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/audit-trail', label: 'Audit Trail', icon: FileSearch },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
]

const ROLE_LABELS = {
  ADMINISTRATOR: 'Administrator',
  SUPERVISOR: 'Supervisor',
  STOCK_CONTROL: 'Stock Control',
}

export default function AppShell({ children, title, subtitle, actions }) {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => api('/auth/me'),
    retry: false,
  })

  useEffect(() => {
    if (isError) router.replace('/login')
  }, [isError, router])

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1024)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const user = data?.user

  const handleLogout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {}
    queryClient.clear()
    router.replace('/login')
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          Loading workspace...
        </div>
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`flex shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-60'}`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
            <Warehouse className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">StockControl</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">WMS Enterprise</div>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-1 px-2">
              {!collapsed && (
                <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.label}
                </div>
              )}
              {section.items.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                if (item.soon) {
                  return (
                    <div
                      key={item.href}
                      title={`${item.label} (coming soon)`}
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-gray-300"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <span className="flex flex-1 items-center justify-between">
                          {item.label}
                          <span className="rounded border border-gray-200 px-1 text-[9px] uppercase text-gray-400">Soon</span>
                        </span>
                      )}
                    </div>
                  )
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                      active ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-2">
          <Button variant="ghost" size="sm" className="w-full justify-center text-gray-400" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              Search...
              <kbd className="rounded border border-gray-200 bg-white px-1 text-[10px]">⌘K</kbd>
            </button>
            {actions}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
                    {user.name?.charAt(0) || 'U'}
                  </div>
                  <div className="hidden text-left md:block">
                    <div className="text-xs font-medium leading-tight">{user.name}</div>
                    <div className="text-[10px] text-gray-500">{ROLE_LABELS[user.role] || user.role}</div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="text-xs font-medium">{user.name}</div>
                  <div className="text-[11px] font-normal text-gray-500">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[user.role] || user.role}</Badge>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Command palette */}
      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <CommandInput placeholder="Go to module..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {NAV_SECTIONS.map((section) => (
            <CommandGroup key={section.label} heading={section.label}>
              {section.items
                .filter((i) => !i.soon)
                .map((item) => (
                  <CommandItem
                    key={item.href}
                    onSelect={() => {
                      setCmdOpen(false)
                      router.push(item.href)
                    }}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </div>
  )
}

export { ScrollText }
