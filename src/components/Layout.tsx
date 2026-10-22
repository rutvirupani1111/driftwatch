import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { ENGINE_LABEL } from '../lib/engine';
import { siteUrl } from '../lib/data';
import { useTheme } from '../lib/hooks';
import { LogoMark } from './Glyph';
import { Icon } from './ui';

const NAV = [
  { to: '/', label: 'Forecast', end: true },
  { to: '/changes', label: 'Changes' },
  { to: '/playground', label: 'Playground' },
  { to: '/watch-your-own', label: 'Watch your own' },
  { to: '/about', label: 'About' },
];

export const REPO_URL = 'https://github.com/rutvirupani1111/driftwatch';
export const API_DRIFT_URL = 'https://github.com/rutvirupani1111/api-drift';

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = theme === 'night' ? 'day' : 'night';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-grid size-9 place-items-center rounded-full border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
      aria-label={theme === 'night' ? 'Switch to the daylight theme' : 'Switch to the night sky theme'}
      title={theme === 'night' ? 'Daylight' : 'Night sky'}
    >
      <Icon name={theme === 'night' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Driftwatch home">
          <LogoMark size={30} />
          <span className="font-serif text-[1.6rem] leading-none text-ink">Driftwatch</span>
        </Link>
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 text-sm transition-colors ${isActive ? 'bg-panel-2 text-ink' : 'text-ink-2 hover:text-ink'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={siteUrl('feed.xml')}
            className="hidden size-9 place-items-center rounded-full border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink sm:inline-grid"
            aria-label="Atom feed of all contract changes"
            title="Atom feed"
          >
            <Icon name="feed" size={16} />
          </a>
          <a
            href={REPO_URL}
            className="hidden size-9 place-items-center rounded-full border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink sm:inline-grid"
            aria-label="Driftwatch on GitHub"
            title="GitHub"
          >
            <Icon name="github" size={16} />
          </a>
          <ThemeToggle />
          <button
            type="button"
            className="inline-grid size-9 place-items-center rounded-full border border-line text-ink lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'close' : 'menu'} size={18} />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Main"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line lg:hidden"
          >
            <ul className="mx-auto max-w-7xl px-4 py-3">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) => `flex items-center justify-between rounded-xl px-3 py-3 text-base ${isActive ? 'bg-panel-2 text-ink' : 'text-ink-2'}`}
                  >
                    {n.label}
                    <Icon name="arrow-right" size={16} className="text-ink-3" />
                  </NavLink>
                </li>
              ))}
              <li className="mt-2 flex gap-2 px-3 pb-1">
                <a href={siteUrl('feed.xml')} className="chip">
                  <Icon name="feed" size={14} /> Atom feed
                </a>
                <a href={REPO_URL} className="chip">
                  <Icon name="github" size={14} /> GitHub
                </a>
              </li>
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="font-serif text-2xl text-ink">Driftwatch</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-ink-2">
            The weather report for the APIs the internet runs on. Runs entirely on GitHub Actions and Pages. Shapes, never values.
          </p>
          <p className="mt-3 text-xs text-ink-3">Contracts inferred by {ENGINE_LABEL}.</p>
        </div>
        <div>
          <div className="kicker mb-3">Subscribe</div>
          <ul className="space-y-2 text-sm">
            <li>
              <a className="link" href={siteUrl('feed.xml')}>
                Atom feed of every change
              </a>
            </li>
            <li>
              <a className="link" href={siteUrl('data/index.json')}>
                Raw data: index.json
              </a>
            </li>
            <li>
              <Link className="link" to="/changes">
                Changelog
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="kicker mb-3">Make it yours</div>
          <ul className="space-y-2 text-sm">
            <li>
              <Link className="link" to="/watch-your-own">
                Watch your own APIs
              </Link>
            </li>
            <li>
              <a className="link" href={REPO_URL}>
                Source on GitHub
              </a>
            </li>
            <li>
              <a className="link" href={API_DRIFT_URL}>
                api-drift, the engine
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-8 text-xs text-ink-3 sm:px-6">MIT licensed · © 2026 Rutvi Rupani</div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 pt-8 outline-none sm:px-6 sm:pt-12">
        {children}
      </main>
      <Footer />
    </>
  );
}
