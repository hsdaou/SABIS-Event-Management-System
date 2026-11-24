import React from 'react';
import { ALL_SABIS_BRANCHES } from '../constants/schools';

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
    <div className="space-y-3 p-4 rounded-xl bg-[#F7F4F2] border border-[#E3DBD3]">
      <div>
        <label className="flex items-center justify-between text-xs font-bold text-[#26211E] mb-2">
          <span>Which school are your kids attending?</span>
          {required ? (
            <span className="text-[11px] font-bold text-[#E53C2E]">* Required</span>
          ) : (
            <span className="text-[11px] font-normal text-[#7B6E65]">Optional</span>
          )}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeType('sabis_isc')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border text-left transition ${
              schoolType === 'sabis_isc'
                ? 'bg-[#016836] border-[#016836] text-white shadow-sm'
                : 'bg-white border-[#E3DBD3] text-[#26211E] hover:border-[#016836]/60'
            }`}
          >
            SABIS Schools
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeType('other');
              onChangeBranch('');
            }}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border text-left transition ${
              schoolType === 'other'
                ? 'bg-[#016836] border-[#016836] text-white shadow-sm'
                : 'bg-white border-[#E3DBD3] text-[#26211E] hover:border-[#016836]/60'
            }`}
          >
            Other School
          </button>
        </div>
      </div>

      {schoolType === 'sabis_isc' && (
        <div>
          <label className="block text-xs font-bold text-[#016836] mb-1.5">
            SABIS Schools {required && <span className="text-[#E53C2E]">*</span>}
          </label>
          <select
            value={schoolBranch}
            required={required}
            onChange={(e) => onChangeBranch(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#016836]/40 text-xs sm:text-sm text-[#26211E] focus:outline-none focus:border-[#016836]"
          >
            <option value="">-- Select a SABIS School --</option>
            <optgroup label="SABIS Schools">
              {ALL_SABIS_BRANCHES.map((branch) => (
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
          <label className="block text-xs font-bold text-[#26211E] mb-1.5">
            Specify School Name {required && <span className="text-[#E53C2E]">*</span>}
          </label>
          <input
            type="text"
            value={schoolOther}
            required={required}
            onChange={(e) => onChangeOther(e.target.value)}
            placeholder="Enter your school name"
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#B6ADA4] text-xs sm:text-sm text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
          />
        </div>
      )}
    </div>
  );
};
