'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dailyCounts } from '@/lib/telemetry/events';
import { localDayKey } from '@/lib/time/day';

interface PlannerCalendarProps {
  /** Planned ayahs per day (the learner's pace). */
  pace: number;
}

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * Month calendar for the Hifz planner.
 *
 * Each day shows whether the learner's planned pace (ayahs/day) was met, per the activity
 * ledger — the Quran.com "Quran in a Year" paradigm framed as a calendar rather than a
 * counter. Past days with activity fill green; days short of pace get an amber ring; today
 * carries `aria-current="date"`. The future is not rendered as empty guilt: only past and
 * current days are coloured.
 */
export const PlannerCalendar: React.FC<PlannerCalendarProps> = ({ pace }) => {
  const todayKey = localDayKey(new Date());
  const [monthOffset, setMonthOffset] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const viewDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Grid of local day keys for the visible month, Monday-less: weeks start Sunday.
  const dayKeys = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(localDayKey(new Date(year, month, d)));
    }
    return cells;
  }, [viewDate]);

  useEffect(() => {
    let active = true;
    const from = dayKeys.find((k): k is string => k !== null);
    const to = dayKeys.filter((k): k is string => k !== null).slice(-1)[0];
    if (!from || !to) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the loading flag before the async IndexedDB read for the newly visible month resolves; the flag belongs to this fetch, not to derived state
    setLoading(true);
    void dailyCounts(from, to)
      .then((result) => {
        if (active) setCounts(result);
      })
      .catch(() => {
        if (active) setCounts({});
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dayKeys]);

  /** Today relative to the visible month: highlighted only when the current month is shown. */
  const isCurrentMonth =
    viewDate.getFullYear() === new Date().getFullYear() && viewDate.getMonth() === new Date().getMonth();

  const dayClass = (key: string): string => {
    const isToday = key === todayKey;
    const isPastOrToday = parseDayKey(key).getTime() <= parseDayKey(todayKey).getTime();
    const done = counts[key] ?? 0;
    if (!isPastOrToday) return 'bg-surface-muted text-muted-foreground/60 border-transparent';
    if (done >= pace && pace > 0) return 'bg-primary-subtle text-primary-strong border-primary/50 font-bold';
    if (done > 0) return 'bg-warning-subtle text-warning-strong border-warning/50';
    return 'bg-surface text-muted-foreground border-border';
  };

  const dayStatusLabel = (key: string): string => {
    const isPastOrToday = parseDayKey(key).getTime() <= parseDayKey(todayKey).getTime();
    const done = counts[key] ?? 0;
    if (!isPastOrToday) return 'planned';
    if (done >= pace && pace > 0) return `completed (${done} activities, target ${pace})`;
    if (done > 0) return `partially completed (${done} of ${pace})`;
    return 'not completed';
  };

  return (
    <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Consistency calendar</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m - 1)}
            aria-label="Previous month"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-xs font-bold text-foreground min-w-[7.5rem] text-center" aria-live="polite">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonthOffset((m) => Math.min(m + 1, 0))}
            disabled={monthOffset >= 0}
            aria-label="Next month"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Filled days met your {pace}-ayah daily pace. Amber days had activity but fell short. Colour is backed by each
        day&apos;s accessible label, so the schedule reads without vision.
      </p>

      <div role="grid" aria-label={`Practice calendar for ${monthLabel}`}>
        <div role="row" className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_HEADERS.map((day, i) => (
            <span
              key={`${day}-${i}`}
              role="columnheader"
              className="text-center text-[10px] font-bold text-muted-foreground uppercase"
            >
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dayKeys.map((key, index) =>
            key === null ? (
              <span key={`pad-${index}`} aria-hidden="true" />
            ) : (
              <div
                key={key}
                role="gridcell"
                aria-current={isCurrentMonth && key === todayKey ? 'date' : undefined}
                aria-label={`${viewDate.toLocaleDateString(undefined, { month: 'long' })} ${parseDayKey(key).getDate()}: ${dayStatusLabel(key)}`}
                title={`${parseDayKey(key).getDate()}: ${dayStatusLabel(key)}`}
                className={`aspect-square rounded-lg border text-center text-[11px] leading-[2.1] transition-colors ${dayClass(key)}`}
              >
                {parseDayKey(key).getDate()}
              </div>
            )
          )}
        </div>
      </div>
      {loading && (
        <p role="status" className="text-[10px] text-muted-foreground">
          Loading practice history…
        </p>
      )}
    </div>
  );
};
