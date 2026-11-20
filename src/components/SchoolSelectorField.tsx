import React from 'react';
import { ISC_BRANCHES, SIS_BRANCHES } from '../constants/schools';

interface SchoolSelectorFieldProps {
  schoolType: 'sabis_isc' | 'other' | '';
  schoolBranch: string;
  schoolOther: string;
  onChangeType: (t: 'sabis_isc' | 'other' | '') => void;
  onChangeBranch: (b: string) => void;
  onChangeOther: (o: string) => void;
  required?: boolean;
}

export const SchoolSelectorField: React.FC<SchoolSelectorFieldProps> = ({
  schoolType,
  schoolBranch,
  schoolOther,
  onChangeType,
  onChangeBranch,
  onChangeOther,
  required = false,
}) => {
  return (
    <div className="space-y-3 p-3.5 rounded-xl bg-slate-900/70 border border-slate-700/80">
      <div>
        <label className="block text-xs font-semibold text-slate-200 mb-1.5">
          Which school are your kids attending? {required && <span className="text-rose-400">*</span>}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeType('sabis_isc')}
            className={`px-3 py-2.5 rounded-xl text-xs font-semibold border text-left transition ${
              schoolType === 'sabis_isc'
                ? 'bg-indigo-600/25 border-indigo-400 text-white shadow'
                : 'bg-slate-950/70 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            SABIS® / International School of Choueifat (ISC)
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeType('other');
              onChangeBranch('');
            }}
            className={`px-3 py-2.5 rounded-xl text-xs font-semibold border text-left transition ${
              schoolType === 'other'
                ? 'bg-indigo-600/25 border-indigo-400 text-white shadow'
                : 'bg-slate-950/70 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            Other School
          </button>
        </div>
      </div>

      {schoolType === 'sabis_isc' && (
        <div>
          <label className="block text-xs font-semibold text-indigo-300 mb-1.5">
            Select SABIS® / ISC Branch {required && <span className="text-rose-400">*</span>}
          </label>
          <select
            value={schoolBranch}
            required={required}
            onChange={(e) => onChangeBranch(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-indigo-500/40 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-400"
          >
            <option value="">-- Choose ISC or SIS Branch --</option>
            <optgroup label="The International School of Choueifat (ISC) Branches">
              {ISC_BRANCHES.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </optgroup>
            <optgroup label="SABIS® International School (SIS) Branches">
              {SIS_BRANCHES.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      )}

      {schoolType === 'other' && (
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Specify School Name {required && <span className="text-rose-400">*</span>}
          </label>
          <input
            type="text"
            value={schoolOther}
            required={required}
            onChange={(e) => onChangeOther(e.target.value)}
            placeholder="Enter your school name"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      )}
    </div>
  );
};
