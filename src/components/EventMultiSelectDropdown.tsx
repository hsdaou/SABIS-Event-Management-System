import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, Search, X } from 'lucide-react';
import type { EventItem } from '../types';

interface EventMultiSelectDropdownProps {
  events: EventItem[];
  selectedEventIds: string[];
  activeEventId: string;
  onChange: (nextIds: string[]) => void;
  placeholder?: string;
  compact?: boolean;
  ariaLabel?: string;
}

export const EventMultiSelectDropdown: React.FC<EventMultiSelectDropdownProps> = ({
  events,
  selectedEventIds,
  activeEventId,
  onChange,
  placeholder = 'Select authorized event(s)...',
  compact = false,
  ariaLabel = 'Select authorized events',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectedEvents = useMemo(
    () => events.filter((ev) => selectedEventIds.includes(ev.id)),
    [events, selectedEventIds]
  );

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (ev) =>
        ev.name.toLowerCase().includes(q) ||
        (ev.eventDate && ev.eventDate.toLowerCase().includes(q))
    );
  }, [events, search]);

  const toggleEvent = (eventId: string) => {
    const next = selectedEventIds.includes(eventId)
      ? selectedEventIds.filter((id) => id !== eventId)
      : [...selectedEventIds, eventId];
    onChange(next);
  };

  const summaryText = useMemo(() => {
    if (selectedEvents.length === 0) return placeholder;
    if (selectedEvents.length === 1) return selectedEvents[0].name;
    return `${selectedEvents[0].name} + ${selectedEvents.length - 1} more`;
  }, [placeholder, selectedEvents]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl bg-white border transition text-left ${
          open ? 'border-[#016836] ring-2 ring-[#016836]/15' : 'border-[#B6ADA4] hover:border-[#016836]'
        } ${compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2.5 text-xs sm:text-sm'}`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Calendar className="w-3.5 h-3.5 text-[#016836] shrink-0" />
          <span
            className={`truncate ${
              selectedEvents.length === 0 ? 'text-[#7B6E65]' : 'font-semibold text-[#26211E]'
            }`}
          >
            {summaryText}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {selectedEvents.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#DFF0D8] text-[#016836] border border-[#016836]/25">
              {selectedEvents.length}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-[#7B6E65] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {/* Selected Event Chips */}
      {selectedEvents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedEvents.map((ev) => (
            <span
              key={ev.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#EDF6F1] text-[#016836] border border-[#016836]/25 max-w-full"
            >
              <span className="truncate max-w-[200px]">{ev.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleEvent(ev.id);
                }}
                className="p-0.5 rounded hover:bg-[#016836]/15 text-[#016836]"
                title={`Remove ${ev.name}`}
                aria-label={`Remove ${ev.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-40 rounded-xl bg-white border border-[#E3DBD3] shadow-xl overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-[#E3DBD3] bg-[#F7F4F2]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#7B6E65] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-white border border-[#E3DBD3] text-xs text-[#26211E] placeholder-[#7B6E65]/70 focus:outline-none focus:border-[#016836]"
              />
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5 px-0.5">
              <button
                type="button"
                onClick={() => onChange([activeEventId])}
                className="text-[11px] font-semibold text-[#016836] hover:underline"
              >
                Current Event Only
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onChange(events.map((e) => e.id))}
                  className="text-[11px] font-semibold text-[#0080BB] hover:underline"
                >
                  Select All ({events.length})
                </button>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] font-semibold text-[#7B6E65] hover:text-[#E53C2E]"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable Event Options */}
          <div className="max-h-56 overflow-y-auto p-1.5 space-y-1">
            {filteredEvents.length === 0 ? (
              <p className="text-xs text-[#7B6E65] text-center py-4">No matching events found.</p>
            ) : (
              filteredEvents.map((ev) => {
                const checked = selectedEventIds.includes(ev.id);
                const isCurrent = ev.id === activeEventId;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => toggleEvent(ev.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition ${
                      checked
                        ? 'bg-[#EDF6F1] text-[#26211E] font-semibold'
                        : 'hover:bg-[#F7F4F2] text-[#26211E]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                          checked
                            ? 'bg-[#016836] border-[#016836] text-white'
                            : 'bg-white border-[#B6ADA4]'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      <span className="truncate">{ev.name}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {ev.eventDate && (
                        <span className="text-[10px] font-mono text-[#7B6E65]">{ev.eventDate}</span>
                      )}
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DFF0D8] text-[#016836] border border-[#016836]/25">
                          Current
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
