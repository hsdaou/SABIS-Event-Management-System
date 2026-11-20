import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { EventProvider, useEvent } from './context/EventContext';
import { ControlDashboardPage } from './pages/ControlDashboardPage';
import { GateControlPage } from './pages/GateControlPage';
import { InvitationPage } from './pages/InvitationPage';
import { LoginPage } from './pages/LoginPage';
import { RegularDashboardPage } from './pages/RegularDashboardPage';
import type { UserRole } from './types';

function roleHomePath(role: UserRole): string {
  if (role === 'control') return '/control';
  if (role === 'regular') return '/dashboard';
  return '/gate';
}

const RequireRole: React.FC<{ allowed: UserRole[]; children: React.ReactNode }> = ({
  allowed,
  children,
}) => {
  const { session, loading } = useEvent();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-sm text-slate-400">
        Loading SABIS® Event Management System...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(session.role)) {
    return <Navigate to={roleHomePath(session.role)} replace />;
  }

  return <>{children}</>;
};

const RootRedirect: React.FC = () => {
  const { session } = useEvent();
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  // Backward compatibility for links with ?venue=... or ?mode=parent
  if (params.has('venue') || params.get('mode') === 'parent') {
    return <Navigate to={`/register${location.search}`} replace />;
  }

  if (session) {
    return <Navigate to={roleHomePath(session.role)} replace />;
  }

  return <Navigate to="/login" replace />;
};

const LoginGuard: React.FC = () => {
  const { session } = useEvent();
  if (session) {
    return <Navigate to={roleHomePath(session.role)} replace />;
  }
  return <LoginPage />;
};

const ToastOverlay: React.FC = () => {
  const { toast } = useEvent();
  if (!toast) return null;

  const toneStyle =
    toast.tone === 'success'
      ? 'border-emerald-500/50 text-emerald-200'
      : toast.tone === 'warning'
      ? 'border-amber-500/50 text-amber-200'
      : toast.tone === 'error'
      ? 'border-rose-500/50 text-rose-200'
      : 'border-indigo-500/50 text-slate-100';

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-slate-900/95 border shadow-2xl text-xs font-semibold max-w-sm ${toneStyle}`}
    >
      {toast.text}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <EventProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/register" element={<InvitationPage />} />
          <Route path="/login" element={<LoginGuard />} />

          <Route
            path="/control"
            element={
              <RequireRole allowed={['control']}>
                <ControlDashboardPage />
              </RequireRole>
            }
          />

          <Route
            path="/dashboard"
            element={
              <RequireRole allowed={['control', 'regular']}>
                <RegularDashboardPage />
              </RequireRole>
            }
          />

          <Route
            path="/gate"
            element={
              <RequireRole allowed={['control', 'gate']}>
                <GateControlPage />
              </RequireRole>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastOverlay />
      </BrowserRouter>
    </EventProvider>
  );
};

export default App;
