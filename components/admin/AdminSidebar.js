'use client';

import { usePathname } from 'next/navigation';
import { LayoutDashboard, LayoutGrid, AlertTriangle, DollarSign, Activity, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VyradeMark } from '@/components/VyradeLogo';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/blueprints', label: 'Blueprints', icon: LayoutGrid },
  { href: '/admin/failures', label: 'Failures', icon: AlertTriangle },
  { href: '/admin/cost', label: 'Cost & usage', icon: DollarSign },
  { href: '/admin/insights', label: 'Insights', icon: Activity },
];

function isActive(pathname, item) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, active, compact }) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        compact && 'flex-col gap-1 px-3 py-1.5 text-xs',
        active
          ? 'bg-blue-600/10 font-medium text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active && 'text-blue-600 dark:text-blue-400')} />
      <span className={cn(!compact && 'truncate')}>{item.label}</span>
    </a>
  );
}

export default function AdminSidebar({ user }) {
  const pathname = usePathname() || '/admin';

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <VyradeMark className="h-6 w-auto" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-foreground">Vyrade</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">Admin</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Operations</p>
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
        </nav>

        <div className="border-t border-border p-3">
          {user?.email && (
            <div className="mb-2 flex items-center gap-2 px-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/15 text-xs font-semibold text-blue-600 dark:text-blue-400">
                {(user.email[0] || 'A').toUpperCase()}
              </span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          )}
          <a href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </a>
        </div>
      </aside>

      {/* ── Mobile top nav ── */}
      <div className="sticky top-0 z-40 border-b border-border bg-card md:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <VyradeMark className="h-5 w-auto" />
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item)} compact />
          ))}
        </nav>
      </div>
    </>
  );
}
