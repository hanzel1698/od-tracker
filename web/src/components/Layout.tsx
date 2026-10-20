import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAlerts } from '@/data/hooks'
import { cx } from './ui'

const MAIN = [
  { to: '/', label: 'Dashboard', icon: '◫' },
  { to: '/ods', label: 'ODs', icon: '₹' },
  { to: '/fds', label: 'FDs', icon: '▤' },
  { to: '/interest', label: 'Interest', icon: '%' },
]
const MORE = [
  { to: '/savings', label: 'Savings accounts' },
  { to: '/branches', label: 'Branches' },
  { to: '/import-export', label: 'Import / export' },
  { to: '/settings', label: 'Settings' },
]

function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark')
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  } catch {
    /* private mode */
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const loc = useLocation()
  const alertCount = useAlerts().data?.length ?? 0
  const moreActive = MORE.some((m) => loc.pathname.startsWith(m.to))

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-700 text-sm text-white">₹</span>
            OD Tracker
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {[...MAIN, ...MORE].map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-2.5 py-1.5 text-sm font-medium',
                    isActive ? 'bg-blue-50 text-blue-700 dark:bg-slate-800 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                  )
                }
              >
                {n.label}
                {n.to === '/' && alertCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">{alertCount}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggleTheme} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" title="Toggle dark mode" aria-label="Toggle dark mode">
              <span className="dark:hidden">☾</span>
              <span className="hidden dark:inline">☀</span>
            </button>
            <button onClick={() => supabase.auth.signOut()} className="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 sm:py-6">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-slate-800 dark:bg-slate-950">
        <div className="grid grid-cols-5">
          {MAIN.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                cx('relative flex flex-col items-center py-2 text-xs', isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-500')
              }
            >
              <span className="text-lg leading-5">{n.icon}</span>
              {n.label}
              {n.to === '/' && alertCount > 0 && (
                <span className="absolute top-1 right-1/4 rounded-full bg-amber-500 px-1 text-[10px] text-white">{alertCount}</span>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen((o) => !o)} className={cx('flex flex-col items-center py-2 text-xs', moreActive || moreOpen ? 'text-blue-700 dark:text-blue-400' : 'text-slate-500')}>
            <span className="text-lg leading-5">⋯</span>
            More
          </button>
        </div>
        {moreOpen && (
          <div className="absolute right-2 bottom-full mb-2 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            {MORE.map((m) => (
              <NavLink key={m.to} to={m.to} onClick={() => setMoreOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                {m.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </div>
  )
}
