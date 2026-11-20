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
  const { venues, registrations, scanLogs } = useEvent();
  const [activeTab, setActiveTab] = useState<RegularTab>('landing');
  const [inspectingReg, setInspectingReg] = useState<Registration | null>(null);

  const arrivedCount = registrations.filter((r) => getRegistrationStatus(r) !== 'PENDING').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <TopBar />

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Clean Navigation Bar — NO Settings, NO Link Generation, NO Max Capacity */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">Event Dashboard</h2>
            <p className="text-xs text-slate-400">
              Click any summary card below to inspect live details, register walk-ins at the desk, or track live attendance
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('landing')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'landing'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
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
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Live Attendance</span>
              <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {arrivedCount}/{registrations.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'logs'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Event Logs ({scanLogs.length})</span>
            </button>
          </nav>
        </div>

        {/* Clickable KPI Cards (matching the attached photo, clickable to show full details) */}
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
