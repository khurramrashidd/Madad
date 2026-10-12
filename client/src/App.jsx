import { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SocketProvider, useSocket } from './context/SocketContext.jsx';
import { OfflineProvider } from './context/OfflineContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';
import { LocationProvider, useLocation as useGeo } from './context/LocationContext.jsx';

import BottomNav from './components/BottomNav.jsx';
import AppHeader from './components/AppHeader.jsx';
import Sidebar from './components/Sidebar.jsx';
import LocationSheet from './components/LocationSheet.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import Welcome from './components/Welcome.jsx';
import Spinner from './components/Spinner.jsx';
import { api } from './api/client.js';
import { SOCKET_EVENTS } from './utils/constants.js';

/**
 * The demo guide and account switcher carry the seeded logins. __DEMO_TOOLS__
 * is replaced with a literal at build time (see vite.config.js): true on the
 * dev server and in the phone build you present from, false in a web
 * production build — where this becomes `null` and Rollup never follows the
 * import, so the credentials are not in the bundle at all.
 */
const DevTools = __DEMO_TOOLS__
  ? lazy(() => import('./components/DevTools.jsx'))
  : null;

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Feed from './pages/Feed.jsx';
import CreateTask from './pages/CreateTask.jsx';
import TaskDetail from './pages/TaskDetail.jsx';
import MyTasks from './pages/MyTasks.jsx';
import Chats from './pages/Chats.jsx';
import Chat from './pages/Chat.jsx';
import Profile from './pages/Profile.jsx';
import UserProfile from './pages/UserProfile.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Notifications from './pages/Notifications.jsx';
import Earnings from './pages/Earnings.jsx';
import Safety from './pages/Safety.jsx';
import Help from './pages/Help.jsx';

// The trip watcher is opened by people without an account, from a link in a
// chat app. Keeping it out of the main bundle means they download the map and
// nothing else.
const TripWatch = lazy(() => import('./pages/TripWatch.jsx'));

// Admin is a minority path — keep it out of the main bundle.
const Admin = lazy(() => import('./pages/Admin.jsx'));

function FullScreenLoader() {
  return (
    <div className="grid place-items-center h-full bg-ink-50">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-600 grid place-items-center mx-auto mb-4">
          <span className="font-display font-extrabold text-2xl text-white">M</span>
        </div>
        <Spinner size={22} className="text-brand-500 mx-auto" />
      </div>
    </div>
  );
}

function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  // Overlays sit here so they appear on every signed-in screen — including the
  // task detail page, where most of the interesting flow happens — but never
  // on the login screen.
  return (
    <>
      <Outlet />
      <Overlays />
    </>
  );
}

function RequireAdmin() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Everything that floats above the app on every signed-in screen.
 *
 * The welcome cards and the two demo helpers live here rather than inside a
 * single shell, because the most interesting parts of the flow happen on the
 * task detail screen — which is not a tab.
 */
function Overlays() {
  const startGuide = () => window.dispatchEvent(new CustomEvent('madad:open-guide'));
  return (
    <>
      <Welcome onStartGuide={startGuide} />
      <InstallPrompt />
      {DevTools && (
        <Suspense fallback={null}>
          <DevTools />
        </Suspense>
      )}
    </>
  );
}

/**
 * Chrome that only the main tabs share — chat and detail screens go
 * full-bleed, because a conversation should fill the phone.
 *
 * The header, the drawer and the location sheet live here rather than inside
 * each page. They are the same on every tab, they share one position and one
 * unread count, and hoisting them means a page cannot forget to render them.
 */
function TabShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { on, connected } = useSocket();
  const location = useGeo();

  // Unread notification count for the header bell. Loaded once, then kept
  // current by the socket rather than polled.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api.users
        .notifications()
        .then((r) => alive && setUnread(r.unread || 0))
        .catch(() => {});
    load();
    const offNotify = on(SOCKET_EVENTS.NOTIFICATION, () => setUnread((n) => n + 1));
    return () => {
      alive = false;
      offNotify();
    };
  }, [on]);

  const live = connected && location.located && !location.blocked;

  return (
    <div className="flex flex-col h-full bg-ink-50">
      <AppHeader
        onOpenMenu={() => setMenuOpen(true)}
        onFixLocation={() => setLocationOpen(true)}
        location={location}
        unreadCount={unread}
        live={live}
      />
      <OfflineBanner />
      <main className="flex-1 min-h-0">
        <Outlet context={{ openLocationSheet: () => setLocationOpen(true) }} />
      </main>
      <BottomNav />

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <LocationSheet
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        location={location}
      />
    </div>
  );
}

function BareShell() {
  return (
    <div className="flex flex-col h-full bg-ink-50">
      <OfflineBanner />
      <main className="flex-1 min-h-0">
        <Outlet />
      </main>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <Register />} />

      {/*
        Public, by design. A trip share link is opened by whoever the user
        sent it to — a parent, a flatmate — who has no Madad account and
        should not be asked to make one to see that someone got home safely.
        The token in the URL is the credential.
      */}
      <Route
        path="/trip/:token"
        element={
          <Suspense fallback={<FullScreenLoader />}>
            <TripWatch />
          </Suspense>
        }
      />

      <Route element={<RequireAuth />}>
        {/* Tabbed screens */}
        <Route element={<TabShell />}>
          <Route path="/" element={<Feed />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        {/* Full-screen screens */}
        <Route element={<BareShell />}>
          <Route path="/create" element={<CreateTask />} />
          <Route path="/task/:id" element={<TaskDetail />} />
          <Route path="/chat/:taskId" element={<Chat />} />
          <Route path="/profile/:id" element={<UserProfile />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/earnings" element={<Earnings />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/help" element={<Help />} />

          <Route element={<RequireAdmin />}>
            <Route
              path="/admin"
              element={
                <Suspense fallback={<FullScreenLoader />}>
                  <Admin />
                </Suspense>
              }
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Provider order is load-bearing:
 *
 *   Theme   — outermost, and intentionally outside Auth: the login screen
 *             must respect dark mode too.
 *   I18n    — needs the API client (to save the choice), nothing else.
 *   Auth    — everything below needs to know who is signed in.
 *   Offline → Socket — the socket only connects once authenticated.
 *   Location— needs the socket, to report position for geo-targeted pushes.
 *   Toast   — innermost, so any screen can raise one.
 */
export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <OfflineProvider>
              <SocketProvider>
                <LocationProvider>
                  <ToastProvider>
                    <AppRoutes />
                  </ToastProvider>
                </LocationProvider>
              </SocketProvider>
            </OfflineProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
