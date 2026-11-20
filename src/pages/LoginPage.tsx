import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Mail, QrCode, Shield, Smartphone, Users } from 'lucide-react';
import { useEvent } from '../context/EventContext';
import type { UserRole } from '../types';

export const LoginPage: React.FC = () => {
  const { settings, isLiveSupabase, loginWithEmail, sendMagicLink, showToast } = useEvent();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const redirectByRole = (role: UserRole) => {
    if (role === 'control') navigate('/control');
    else if (role === 'regular') navigate('/dashboard');
    else navigate('/gate');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await loginWithEmail(email, password);
      if (!res.ok || !res.role) {
        setErrorMsg(res.error || 'Unable to sign in.');
        return;
      }
      showToast('Signed in successfully!', 'success');
      redirectByRole(res.role);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLink = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await sendMagicLink(email);
      if (!res.ok) {
        setErrorMsg(res.error || 'Failed to send magic link.');
      } else {
        setMagicSent(true);
        showToast('Magic login link sent to your email!', 'success');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const quickDemoLogin = async (demoEmail: string) => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await loginWithEmail(demoEmail);
      if (res.ok && res.role) {
        showToast(`Signed in as ${demoEmail}`, 'success');
        redirectByRole(res.role);
      } else {
        setErrorMsg(res.error || 'Quick login failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center mx-auto shadow-xl shadow-indigo-500/25">
            <QrCode className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            SABIS® Event Management
          </h1>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">{settings.eventTitle}</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isLiveSupabase
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isLiveSupabase ? 'bg-emerald-400' : 'bg-sky-400'
                }`}
              />
              {isLiveSupabase ? 'Supabase Auth Connected' : 'Local Preview Mode'}
            </span>
          </div>
        </div>

        {/* Login Card */}
        <div className="glass-panel rounded-2xl p-6 shadow-2xl border border-slate-700/80 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white">Staff &amp; Control Sign In</h2>
            <p className="text-xs text-slate-400">
              Sign in with an email address authorized by the Control Dashboard.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {magicSent && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-200">
              Check your inbox! We sent a one-click sign-in link to <strong>{email}</strong>.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Registered Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@sabis-events.edu"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {isLiveSupabase && (
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>{submitting ? 'Signing in...' : 'Sign In to Portal'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {isLiveSupabase && (
              <button
                type="button"
                disabled={submitting || !email}
                onClick={handleMagicLink}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition disabled:opacity-50"
              >
                Send One-Click Email Magic Link Instead
              </button>
            )}
          </form>

          {/* Local Preview Role Shortcuts (only shown when Supabase env vars are not yet connected) */}
          {!isLiveSupabase && (
            <div className="pt-4 border-t border-slate-800 space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Quick Access (Preview Mode Accounts)
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => quickDemoLogin('admin@sabis-events.edu')}
                  className="p-2.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 flex items-center justify-between text-left transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-white">Control Dashboard Admin</p>
                      <p className="text-[11px] font-mono text-indigo-300">admin@sabis-events.edu</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-indigo-400" />
                </button>

                <button
                  type="button"
                  onClick={() => quickDemoLogin('staff@sabis-events.edu')}
                  className="p-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 flex items-center justify-between text-left transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-sky-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-white">Tier 1 — Regular Dashboard User</p>
                      <p className="text-[11px] font-mono text-sky-300">staff@sabis-events.edu</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-sky-400" />
                </button>

                <button
                  type="button"
                  onClick={() => quickDemoLogin('gate@sabis-events.edu')}
                  className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 flex items-center justify-between text-left transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-white">Tier 2 — Gate Control Mobile Scanner</p>
                      <p className="text-[11px] font-mono text-emerald-300">gate@sabis-events.edu</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Any new email added in Control Dashboard &rarr; User Access can also sign in right above.
              </p>
            </div>
          )}
        </div>

        <div className="text-center">
          <Link
            to="/register"
            className="text-xs text-slate-400 hover:text-indigo-300 underline underline-offset-4 transition"
          >
            Open Public Parent Invitation Page (/register) &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};
