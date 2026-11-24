import React, { useState } from 'react';
import { Activity, Clock, LayoutDashboard } from 'lucide-react';
import { EventLogsPanel } from '../components/EventLogsPanel';
import { KpiStrip } from '../components/KpiStrip';
import { LiveAttendanceView } from '../components/LiveAttendanceView';
import { PassInspectorModal } from '../components/PassInspectorModal';
import { StaffDeskRegistration } from '../components/StaffDeskRegistration';
import { TopBar } from '../components/TopBar';
import { useEvent } from '../context/EventContext';
import { getRegistrationStatus } from '../lib/qr';
import type { Registration } from '../types';

type RegularTab = 'landing' | 'attendance' | 'logs';

export const RegularDashboardPage: React.FC = () => {
  const { activeEvent, hasAssignedEvents, venues, registrations, scanLogs } = useEvent();
  const [activeTab, setActiveTab] = useState<RegularTab>('landing');
  const [inspectingReg, setInspectingReg] = useState<Registration | null>(null);

  const arrivedCount = registrations.filter((r) => getRegistrationStatus(r) !== 'PENDING').length;

  if (!hasAssignedEvents) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F4F2]">
        <TopBar />
        <main className="max-w-lg mx-auto w-full px-4 py-16 flex-1 flex items-center justify-center">
          <div className="glass-panel rounded-2xl p-7 border-t-4 border-t-[#8A6D3B] text-center space-y-2.5">
            <h2 className="text-lg font-bold text-[#26211E]">No Events Assigned Yet</h2>
            <p className="text-xs text-[#7B6E65] leading-relaxed">
              Your School Dashboard account does not currently have any events assigned. Please ask a Control Dashboard Administrator to authorize you for your event(s).
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F4F2]">
      <TopBar />

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Clean Navigation Bar — NO Settings, NO Link Generation, NO Max Capacity */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#016836]">
              {activeEvent.name}
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#26211E]">School Dashboard</h2>
            <p className="text-xs text-[#7B6E65]">
              Click any summary card below to inspect live details, register walk-ins at the desk, or track live attendance
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-xl border border-[#E3DBD3] shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('landing')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'landing'
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview &amp; Desk</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('attendance')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'attendance'
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Live Attendance</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[11px] border ${
                  activeTab === 'attendance'
                    ? 'bg-white/20 text-white border-white/30'
                    : 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                }`}
              >
                {arrivedCount}/{registrations.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'logs'
                  ? 'bg-[#016836] text-white shadow-sm'
                  : 'text-[#7B6E65] hover:text-[#26211E] hover:bg-[#F7F4F2]'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Event Logs ({scanLogs.length})</span>
            </button>
          </nav>
        </div>

        {/* Clickable KPI Cards */}
        <KpiStrip
          registrations={registrations}
          scanLogs={scanLogs}
          onInspectPasses={setInspectingReg}
        />

        {/* Tab 1: Clean Landing Page + Staff Desk Manual Registration & Pass Lookup */}
        {activeTab === 'landing' && (
          <StaffDeskRegistration onInspectAllPasses={setInspectingReg} />
        )}

        {/* Tab 2: Live Attendance (Kept as-is, strictly view-only, NO max capacity) */}
        {activeTab === 'attendance' && (
          <LiveAttendanceView
            venues={venues}
            registrations={registrations}
            readOnly={true}
            onInspectPasses={setInspectingReg}
          />
        )}

        {/* Tab 3: Event Logs (Visible to all users, Valid / Used / Invalid with timing logs) */}
        {activeTab === 'logs' && <EventLogsPanel logs={scanLogs} canClear={false} />}
      </main>

      <PassInspectorModal registration={inspectingReg} onClose={() => setInspectingReg(null)} />
    </div>
  );
};
