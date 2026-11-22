import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEvent } from '../context/EventContext';

export const TopBar: React.FC = () => {
  const {
    events,
    activeEvent,
    setActiveEventId,
    session,
    isLiveSupabase,
    audioMuted,
    toggleAudioMute,
    logout,
  } = useEvent();
  const navigate = useNavigate();
  const location = useLocation();

  if (!session) return null;

  const isControl = session.role === 'control';
  const currentPath = location.pathname;

  const roleBadgeLabel =
    session.role === 'control'
      ? 'Control Admin'
      : session.role === 'regular'
      ? 'School Dashboard'
      : 'Gate Control';

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b-2 border-[#016836] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Official SABIS® Logo + Event Selector */}
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src="/sabis-logo.svg"
            alt="SABIS® Logo"
            className="h-9 sm:h-10 w-auto shrink-0"
          />
          <div className="h-8 w-px bg-[#E3DBD3] hidden sm:block" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#016836] shrink-0" />
                <select
                  aria-label="Select Event"
                  value={activeEvent.id}
                  onChange={(e) => setActiveEventId(e.target.value)}
                  className="text-xs sm:text-sm font-bold text-[#26211E] bg-[#F7F4F2] border border-[#E3DBD3] rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#016836] max-w-[230px] sm:max-w-[300px] truncate cursor-pointer"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  isLiveSupabase
                    ? 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                    : 'bg-[#E6F4FA] text-[#0080BB] border-[#0080BB]/25'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLiveSupabase ? 'bg-[#016836] animate-pulse' : 'bg-[#0080BB]'
                  }`}
                />
                {isLiveSupabase ? 'Supabase Live' : 'Preview Sync'}
              </span>
            </div>
            <p className="text-[11px] text-[#7B6E65] truncate mt-0.5">
              {session.fullName} ({session.email}) •{' '}
              <span className="text-[#016836] font-semibold">{roleBadgeLabel}</span>
            </p>
          </div>
        </div>

        {/* View Toggle for Authenticated Control Dashboard Users */}
        {isControl && (
          <div
            className="flex items-center gap-1 bg-[#F7F4F2] p-1 rounded-xl border border-[#E3DBD3]"
            role="navigation"
            aria-label="Control View Switcher"
          >
            <button
              type="button"
              onClick={() => navigate('/control')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentPath.startsWith('/control')
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-white'
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
                  ? 'bg-[#0080BB] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>School Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/gate')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentPath.startsWith('/gate')
                  ? 'bg-[#046937] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-white'
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
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#F7F4F2] hover:bg-[#E3DBD3]/60 text-[#26211E] border border-[#E3DBD3] flex items-center gap-1.5 transition"
            title="Toggle Scanner Audio Feedback"
          >
            {audioMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-[#E53C2E]" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-[#016836]" />
            )}
            <span className="hidden md:inline">{audioMuted ? 'Muted' : 'Sound'}</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-[#F2DEDE] hover:text-[#E53C2E] hover:border-[#E53C2E]/40 text-[#7B6E65] border border-[#E3DBD3] flex items-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
