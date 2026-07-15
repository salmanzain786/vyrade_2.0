'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Plus, History, User, LogOut, Sun, Moon, Search, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VyradeMark } from '@/components/VyradeLogo';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

const navItemClass =
  'flex size-10 items-center justify-center rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors text-foreground';
const mobileNavItemClass =
  'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-lg hover:bg-accent transition-colors text-foreground';

function formatCost(v) {
  const n = Number(v);
  if (!n) return null;
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export default function AppSidebar({ user, conversations = [], currentSessionId, onNewChat, onSelect }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [desktopProfileOpen, setDesktopProfileOpen] = React.useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === 'dark' : true;
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  async function signOut() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.assign('/login');
  }

  const filtered = query.trim()
    ? conversations.filter((c) => (c.title || '').toLowerCase().includes(query.trim().toLowerCase()))
    : conversations;

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  const ProfileMenu = () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600/20 text-sm font-semibold text-blue-500">
          {initial}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{user?.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
        </div>
      </div>
      <div className="h-px bg-border" />
      <button
        onClick={signOut}
        className="flex items-center gap-2 w-full p-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
      >
        <LogOut className="h-4 w-4" /><span>Logout</span>
      </button>
    </div>
  );

  function pick(sid) {
    setHistoryOpen(false);
    onSelect?.(sid);
  }

  return (
    <TooltipProvider delayDuration={200}>
      {/* ── Desktop icon rail ── */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-16 border-r bg-background hidden sm:flex flex-col items-center py-4 gap-4">
        <button onClick={onNewChat} className="mb-2 flex size-10 items-center justify-center rounded-lg" aria-label="Vyrade">
          <VyradeMark className="h-[26px] w-auto" />
        </button>

        <nav className="flex flex-col gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onNewChat} className={navItemClass}><Plus className="h-6 w-6" /></button>
            </TooltipTrigger>
            <TooltipContent side="right"><p>New Chat</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setHistoryOpen(true)}
                className={cn(navItemClass, historyOpen && 'bg-accent text-accent-foreground')}
              >
                <History className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right"><p>Chat History</p></TooltipContent>
          </Tooltip>
        </nav>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={toggleTheme} className={navItemClass} aria-label="Toggle theme">
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>{isDark ? 'Light Mode' : 'Dark Mode'}</p></TooltipContent>
        </Tooltip>

        <Popover open={desktopProfileOpen} onOpenChange={setDesktopProfileOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button className={cn('flex size-10 items-center justify-center rounded-lg bg-accent hover:bg-accent/80 transition-colors text-foreground', desktopProfileOpen && 'bg-accent/90')}>
                  <User className="h-5 w-5" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right"><p>Profile</p></TooltipContent>
          </Tooltip>
          <PopoverContent side="right" align="end" className="w-64"><ProfileMenu /></PopoverContent>
        </Popover>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t bg-background flex sm:hidden items-center px-1">
        <button onClick={onNewChat} className={mobileNavItemClass}>
          <Plus className="h-5 w-5" /><span className="text-[10px] font-medium">New</span>
        </button>
        <button onClick={() => setHistoryOpen(true)} className={mobileNavItemClass}>
          <History className="h-5 w-5" /><span className="text-[10px] font-medium">History</span>
        </button>
        <button onClick={toggleTheme} className={mobileNavItemClass}>
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          <span className="text-[10px] font-medium">{isDark ? 'Light' : 'Dark'}</span>
        </button>
        <Popover open={mobileProfileOpen} onOpenChange={setMobileProfileOpen}>
          <PopoverTrigger asChild>
            <button className={cn(mobileNavItemClass, mobileProfileOpen && 'bg-accent')}>
              <User className="h-5 w-5" /><span className="text-[10px] font-medium">Profile</span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" sideOffset={8} className="w-64"><ProfileMenu /></PopoverContent>
        </Popover>
      </nav>

      {/* ── History Sheet ── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-96 h-[96%] p-0 top-4 !left-4 sm:max-w-80 gap-0 rounded-2xl bg-card border">
          <SheetHeader className="px-4 pt-4 pb-2 space-y-1">
            <SheetTitle className="text-lg">Chat History</SheetTitle>
            <SheetDescription className="text-xs">
              {conversations.length} chat{conversations.length !== 1 ? 's' : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search chats..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 h-9 text-sm"
              />
            </div>
          </div>

          <div className="h-[calc(96vh-130px)] overflow-y-auto scrollbar-thin">
            <div className="p-3 space-y-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 px-4">
                  No chats yet. Start a new conversation!
                </p>
              ) : (
                filtered.map((c) => {
                  const cost = formatCost(c.total_cost_usd);
                  const active = c.session_id === currentSessionId;
                  return (
                    <button
                      key={c.session_id}
                      onClick={() => pick(c.session_id)}
                      className={cn(
                        'flex items-center gap-2 w-full p-2 rounded-md text-left hover:bg-accent transition-colors group',
                        active && 'bg-accent'
                      )}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm flex-1" title={c.title || 'Untitled automation'}>
                        {c.title || 'Untitled automation'}
                      </span>
                      {cost && (
                        <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {cost}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
