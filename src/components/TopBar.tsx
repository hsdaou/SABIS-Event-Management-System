import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  QrCode,
  ShieldCheck,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEvent } from '../context/EventContext';

export const TopBar: React.FC = () => {
  const { settings, session, isLiveSupabase, audioMuted, toggleAudioMute, logout } = useEvent();
  const navigate = useNavigate();
  const location = useLocation();

  if (!session) return null;

  const isControl = session.role === 'control';
  const currentPath = location.pathname;

  const roleBadgeLabel =
    session.role === 'control'
      ? 'Control Admin'
      : session.role === 'regular'
      ? 'Regular Dashboard'
      : 'Gate Control';

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white truncate max-w-[260px] sm:max-w-md">
                {settings.eventTitle}
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  isLiveSupabase
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLiveSupabase ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'
                  }`}
                />
                {isLiveSupabase ? 'Supabase Live' : 'Preview Sync'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {session.fullName} ({session.email}) •{' '}
              <span className="text-indigo-300 font-semibold">{roleBadgeLabel}</span>
            </p>
          </div>
        </div>

        {/* View Toggle for Authenticated Control Dashboard Users */}
        {isControl && (
          <div
            className="flex items-center gap-1 bg-slate-900/95 p-1 rounded-xl border border-slate-700/80"
            role="navigation"
            aria-label="Control View Switcher"
          >
            <button
              type="button"
              onClick={() => navigate('/control')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentPath.startsWith('/control')
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Control Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentPath.startsWith('/dashboard')
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Regular Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/gate')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentPath.startsWith('/gate')
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Gate Scanner</span>
            </button>
          </div>
        )}

        {/* Right Utility Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAudioMute}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
            title="Toggle Scanner Audio Feedback"
          >
            {audioMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="hidden md:inline">{audioMuted ? 'Muted' : 'Sound'}</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-rose-600/20 hover:text-rose-300 hover:border-rose-500/40 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
