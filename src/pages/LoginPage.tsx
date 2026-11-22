import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Mail, Shield, Smartphone, Users } from 'lucide-react';
import { useEvent } from '../context/EventContext';
import type { UserRole } from '../types';

export const LoginPage: React.FC = () => {
  const { activeEvent, isLiveSupabase, loginWithEmail, sendMagicLink, showToast } = useEvent();
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
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-10 bg-[#F7F4F2]">
      <div className="w-full max-w-md space-y-6">
        {/* Official SABIS® Header */}
        <div className="text-center space-y-3">
          <img
            src="/sabis-logo.svg"
            alt="SABIS® Logo"
            className="h-12 w-auto mx-auto"
          />
          <div>
            <h1 className="text-2xl font-bold text-[#26211E] tracking-tight">
              Event Management System
            </h1>
            <p className="text-xs text-[#7B6E65] max-w-sm mx-auto mt-1">{activeEvent.name}</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border ${
                isLiveSupabase
                  ? 'bg-[#DFF0D8] text-[#016836] border-[#016836]/25'
                  : 'bg-[#E6F4FA] text-[#0080BB] border-[#0080BB]/25'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isLiveSupabase ? 'bg-[#016836]' : 'bg-[#0080BB]'
                }`}
              />
              {isLiveSupabase ? 'Supabase Auth Connected' : 'Local Preview Mode'}
            </span>
          </div>
        </div>

        {/* Login Card */}
        <div className="glass-panel rounded-2xl p-6 sm:p-7 border-t-4 border-t-[#016836] space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-[#26211E]">Staff &amp; Control Sign In</h2>
            <p className="text-xs text-[#7B6E65]">
              Sign in with an email address authorized by the Control Dashboard.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#F2DEDE] border border-[#E53C2E]/35 text-xs text-[#A94442] font-medium">
              {errorMsg}
            </div>
          )}

          {magicSent && (
            <div className="p-3 rounded-xl bg-[#DFF0D8] border border-[#016836]/30 text-xs text-[#016836] font-medium">
              Check your inbox! We sent a one-click sign-in link to <strong>{email}</strong>.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#26211E] mb-1.5">
                Registered Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#7B6E65] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@sabis-events.edu"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                />
              </div>
            </div>

            {isLiveSupabase && (
              <div>
                <label className="block text-xs font-bold text-[#26211E] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#7B6E65] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#016836] hover:bg-[#01522B] text-white shadow-md shadow-[#016836]/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>{submitting ? 'Signing in...' : 'Sign In to Portal'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {isLiveSupabase && (
              <button
                type="button"
                disabled={submitting || !email}
                onClick={handleMagicLink}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-[#F7F4F2] hover:bg-[#E3DBD3]/60 text-[#016836] border border-[#E3DBD3] transition disabled:opacity-50"
              >
                Send One-Click Email Magic Link Instead
              </button>
            )}
          </form>

          {!isLiveSupabase && (
            <div className="pt-4 border-t border-[#E3DBD3] space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#7B6E65]">
                Quick Access (Preview Mode Accounts)
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => quickDemoLogin('admin@sabis-events.edu')}
                  className="p-2.5 rounded-xl bg-[#EDF6F1] hover:bg-[#DFF0D8] border border-[#016836]/25 flex items-center justify-between text-left transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-[#016836] shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#26211E]">Control Dashboard Admin</p>
                      <p className="text-[11px] font-mono text-[#016836]">admin@sabis-events.edu</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#016836]" />
                </button>

                <button
                  type="button"
                  onClick={() => quickDemoLogin('staff@sabis-events.edu')}
                  className="p-2.5 rounded-xl bg-[#E6F4FA] hover:bg-[#D4ECF8] border border-[#0080BB]/25 flex items-center justify-between text-left transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-[#0080BB] shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#26211E]">Tier 1 — School Dashboard User</p>
                      <p className="text-[11px] font-mono text-[#0080BB]">staff@sabis-events.edu</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#0080BB]" />
                </button>

                <button
                  type="button"
                  onClick={() => quickDemoLogin('gate@sabis-events.edu')}
                  className="p-2.5 rounded-xl bg-[#FCF8E3] hover:bg-[#F5EBCB] border border-[#8A6D3B]/30 flex items-center justify-between text-left transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-[#8A6D3B] shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#26211E]">Tier 2 — Gate Control Mobile Scanner</p>
                      <p className="text-[11px] font-mono text-[#8A6D3B]">gate@sabis-events.edu</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8A6D3B]" />
                </button>
              </div>
              <p className="text-[11px] text-[#7B6E65]">
                Any new email added in Control Dashboard &rarr; User Access can also sign in right above.
              </p>
            </div>
          )}
        </div>

        <div className="text-center">
          <Link
            to={`/register?event=${encodeURIComponent(activeEvent.slug)}`}
            className="text-xs font-semibold text-[#016836] hover:underline underline-offset-4 transition"
          >
            Open Public Parent Invitation Page (/register) &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};
