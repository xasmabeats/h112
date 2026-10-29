import { useEffect, useState, type ReactNode, Component, lazy, Suspense } from 'react';
import {
  createHashRouter,
  RouterProvider,
  NavLink,
  Outlet,
  useLocation,
  Link,
} from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  LayoutDashboard,
  Disc3,
  FileText,
  CalendarDays,
  Columns3,
  Layers,
  Clapperboard,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Menu,
  X,
  ShieldCheck,
  Download,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db, defaults, initialize } from '../db';
import { DataContext } from './context';
import { NativeProvider } from '../platform/NativeProvider';
import Dashboard from '../features/Dashboard';
import Library from '../features/Library';
import Editor from '../features/Editor';
import Pipeline from '../features/Pipeline';
import Calendar from '../features/Calendar';
import Metadata from '../features/Metadata';
import Templates from '../features/Templates';
import Settings from '../features/Settings';
const Studio = lazy(() => import('../features/releases/Studio'));
const History = lazy(() => import('../features/releases/History'));
import { errorText } from '../components/ui';
const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/beats', label: 'Beat Library', icon: Disc3 },
  { to: '/metadata', label: 'YouTube Metadata', icon: FileText },
  { to: '/calendar', label: 'Release Calendar', icon: CalendarDays },
  { to: '/pipeline', label: 'Release Pipeline', icon: Columns3 },
  { to: '/templates', label: 'Templates', icon: Layers },
  { to: '/studio', label: 'Release Studio', icon: Clapperboard },
  { to: '/history', label: 'Release History', icon: HistoryIcon },
];
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
function Shell() {
  const location = useLocation();
  const [open, setOpen] = useState(false),
    [toast, setToast] = useState(''),
    [install, setInstall] = useState<InstallEvent | null>(null);
  const [initError, setInitError] = useState(''),
    [ready, setReady] = useState(false);
  const beats = useLiveQuery(() => db.beats.toArray(), []),
    templates = useLiveQuery(() => db.templates.toArray(), []),
    settings = useLiveQuery(() => db.settings.get('preferences'), []);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    void initialize()
      .then(() => setReady(true))
      .catch((e) => setInitError(errorText(e)));
    const handler = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const prefs = settings ?? defaults;
  return (
    <DataContext.Provider
      value={{
        beats: beats?.filter((b) => !b.deletedAt) ?? [],
        templates: templates ?? [],
        settings: prefs,
        notify: setToast,
      }}
    >
      <div className={`app ${prefs.appearance === 'compact' ? 'compact' : ''}`}>
        <div className="mobile-header">
          <Link to="/" className="brand">
            <span className="brand-mark">X</span>
            <span>
              XASMA<small>RELEASE MANAGER</small>
            </span>
          </Link>
          <button
            className="icon-button"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <button
            className="sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        )}
        <aside className={`sidebar ${open ? 'open' : ''}`}>
          <Link to="/" className="brand">
            <span className="brand-mark">X</span>
            <span>
              XASMA<small>RELEASE MANAGER</small>
            </span>
          </Link>
          <div className="workspace-name">
            <span className="workspace-dot" /> Personal workspace <span>01</span>
          </div>
          <div className="nav-caption">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                <n.icon size={18} />
                {n.label}
                <ChevronRight className="nav-arrow" size={14} />
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <NavLink className="settings-link" to="/settings">
              <SettingsIcon size={18} /> Settings & Backups
            </NavLink>
            <div className="local-card">
              <ShieldCheck size={18} />
              <div>
                Local. Private. Yours.<small>No accounts. No cloud.</small>
              </div>
            </div>
            {install && (
              <button
                className="button wide"
                onClick={() =>
                  void install
                    .prompt()
                    .then(() => install.userChoice)
                    .then(() => setInstall(null))
                }
              >
                <Download size={15} /> Install XASMA
              </button>
            )}
            <div className="sidebar-footer">
              <span>XASMA STUDIO SYSTEM</span>
              <span>v2.0</span>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <div className="topbar">
            <span>
              WORKSPACE <ChevronRight size={12} />{' '}
              <strong>
                {nav.find((n) =>
                  n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
                )?.label ??
                  (location.pathname === '/settings' ? 'Settings & Backups' : 'Beat Editor')}
              </strong>
            </span>
            <div>
              <span className="online-dot" /> {offlineReady ? 'Offline ready' : 'Local workspace'}{' '}
              <span className="avatar">{(prefs.producer || 'X').slice(0, 1).toUpperCase()}</span>
            </div>
          </div>
          <main id="main" tabIndex={-1}>
            {initError ? (
              <div className="error" role="alert">
                <h1>Local database unavailable</h1>
                <p>{initError}</p>
                <p>
                  Allow browser storage and reload. Existing data has not been intentionally
                  removed.
                </p>
              </div>
            ) : ready && beats && templates ? (
              <Suspense fallback={<p role="status">Opening section…</p>}>
                <Outlet />
              </Suspense>
            ) : (
              <p role="status">Opening your workspace…</p>
            )}
          </main>
          <footer className="main-footer">
            <span>XASMA / BEAT RELEASE MANAGER</span>
            <span>BUILT FOR THE INDEPENDENT</span>
          </footer>
        </div>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        {needRefresh && (
          <div className="update-banner" role="status">
            <RefreshCw size={18} />
            <span>An update is ready. Save your edits first.</span>
            <button
              className="button"
              onClick={() => {
                if (confirm('Reload to update? Save all unsaved edits before continuing.'))
                  void updateServiceWorker(true);
              }}
            >
              Update app
            </button>
          </div>
        )}
      </div>
    </DataContext.Provider>
  );
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: unknown) {
    return { error: errorText(error) };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>Workspace interrupted</h1>
        <p>{this.state.error}</p>
        <p>Your stored data has not been intentionally deleted.</p>
        <button className="button" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'beats', element: <Library /> },
      { path: 'beats/:id', element: <Editor /> },
      { path: 'metadata', element: <Metadata /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'pipeline', element: <Pipeline /> },
      { path: 'templates', element: <Templates /> },
      { path: 'studio', element: <Studio /> },
      { path: 'history', element: <History /> },
      { path: 'settings', element: <Settings /> },
      {
        path: '*',
        element: (
          <div>
            <h1>Page not found</h1>
            <Link to="/">Return to dashboard</Link>
          </div>
        ),
      },
    ],
  },
]);
export default function App() {
  return (
    <ErrorBoundary>
      <NativeProvider>
        <a
          href="#main"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('main')?.focus();
          }}
        >
          Skip to content
        </a>
        <RouterProvider router={router} />
      </NativeProvider>
    </ErrorBoundary>
  );
}
