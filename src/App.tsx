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
      <div className="min-h-screen bg-[#F7F4F2] flex flex-col items-center justify-center gap-3 text-sm text-[#7B6E65]">
        <img src="/sabis-logo.svg" alt="SABIS®" className="h-10 w-auto" />
        <span>Loading SABIS® Event Management System...</span>
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

  if (params.has('venue') || params.has('event') || params.get('mode') === 'parent') {
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
      ? 'bg-[#DFF0D8] border-[#016836] text-[#016836]'
      : toast.tone === 'warning'
      ? 'bg-[#FCF8E3] border-[#8A6D3B] text-[#8A6D3B]'
      : toast.tone === 'error'
      ? 'bg-[#F2DEDE] border-[#E53C2E] text-[#A94442]'
      : 'bg-white border-[#016836] text-[#26211E]';

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border-l-4 border shadow-xl text-xs font-bold max-w-sm ${toneStyle}`}
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
