'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Flame,
  Snowflake,
  Target,
  Plus,
  Trash2,
  Archive,
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Play,
} from 'lucide-react';
import { ReplayDrawer } from '@/components/progress/ReplayDrawer';
import { db } from '@/lib/db';
import { localDayKey, shiftLocalDayKey } from '@/lib/time/day';
import { dailyCounts, track } from '@/lib/telemetry/events';
import { isStreakAtRisk, MAX_FREEZES } from '@/lib/learning/activity';
import {
  bumpPlannerPace,
  computeGoalProgress,
  createDeadlineGoal,
  createGoal,
  archiveGoal,
  deleteGoal,
  goalLabel,
  listActiveGoals,
  WEEKDAY_LABELS,
  type GoalProgress,
} from '@/lib/learning/goals';
import { enableReminder, disableReminder, notificationPermission, notificationsSupported } from '@/lib/learning/reminders';
import { HifzGoalCadence, HifzGoalKind, HifzGoalRecord } from '@/lib/db';
import { SURAHS } from '@/lib/quran/surahs';

const HEATMAP_DAYS = 91; // 13 weeks

function heatColor(count: number): string {
  if (count === 0) return 'bg-muted';
  if (count <= 2) return 'bg-primary/25';
  if (count <= 5) return 'bg-primary/50';
  if (count <= 10) return 'bg-primary/75';
  return 'bg-primary';
}

export default function ProgressPage() {
  const profile = useLiveQuery(() => db.userProfile.get('default_user'));
  const goalRows = useLiveQuery(() => listActiveGoals(), [], []);
  const mistakeRows = useLiveQuery(() => db.recitationMistakes.toArray(), [], []);

  useEffect(() => {
    track('mistakes.page_viewed', {});
  }, []);

  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [goalProgress, setGoalProgress] = useState<GoalProgress[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalKind, setGoalKind] = useState<HifzGoalKind>('memorize');
  const [goalCadence, setGoalCadence] = useState<HifzGoalCadence>('daily');
  const [goalWeekday, setGoalWeekday] = useState(5);
  const [goalTarget, setGoalTarget] = useState(5);
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  const [deadlineFromSurah, setDeadlineFromSurah] = useState(78);
  const [deadlineToSurah, setDeadlineToSurah] = useState(114);
  const [deadlineDate, setDeadlineDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });
  const [deadlineStatus, setDeadlineStatus] = useState<string | null>(null);
  const [reminderHour, setReminderHour] = useState(profile?.reminderHour ?? 20);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);

  const loadHeatmap = useCallback(async () => {
    const to = localDayKey();
    const from = shiftLocalDayKey(to, -(HEATMAP_DAYS - 1));
    setHeatmap(await dailyCounts(from, to));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async DB read on mount, not a derived-state anti-pattern
    void loadHeatmap();
  }, [loadHeatmap]);

  useEffect(() => {
    if (goalRows.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale progress when the goal list itself becomes empty
      setGoalProgress([]);
      return;
    }
    let active = true;
    computeGoalProgress(goalRows).then((result) => {
      if (active) setGoalProgress(result);
    });
    return () => {
      active = false;
    };
  }, [goalRows]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the reminder-hour picker to the profile's saved value once it loads from IndexedDB
    if (profile?.reminderHour !== undefined) setReminderHour(profile.reminderHour);
  }, [profile?.reminderHour]);

  const heatmapDays = useMemo(() => {
    const today = localDayKey();
    return Array.from({ length: HEATMAP_DAYS }, (_, i) => shiftLocalDayKey(today, -(HEATMAP_DAYS - 1 - i)));
  }, []);

  const weakSurahs = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of mistakeRows) counts.set(row.surah, (counts.get(row.surah) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [mistakeRows]);

  const handleCreateGoal = async () => {
    await createGoal({ kind: goalKind, cadence: goalCadence, weekday: goalWeekday, targetAyahs: goalTarget });
    setShowGoalForm(false);
    setGoalTarget(5);
  };

  const handleCreateDeadlineGoal = async () => {
    const goal = await createDeadlineGoal({
      kind: 'memorize',
      fromSurah: deadlineFromSurah,
      toSurah: deadlineToSurah,
      deadline: deadlineDate,
    });
    setShowDeadlineForm(false);
    setDeadlineStatus(
      `Goal created: ${goal.targetAyahs} ayahs by ${goal.deadline}.`
    );
  };

  const handleEnableReminder = async () => {
    const ok = await enableReminder(reminderHour);
    setReminderStatus(ok ? 'Reminders enabled for this browser.' : 'Notification permission was not granted.');
  };

  const handleDisableReminder = async () => {
    await disableReminder();
    setReminderStatus('Reminders turned off.');
  };

  const freezeCount = profile?.streakFreezes ?? 0;
  const atRisk = isStreakAtRisk(profile ?? null);
  const permission = notificationPermission();

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Progress</h1>
        <p className="text-sm text-muted-foreground mt-1">Streak health, activity, goals and recitation weak spots.</p>
      </div>

      {/* Streak & freeze status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${atRisk ? 'bg-danger-subtle text-danger-strong' : 'bg-amber-500/10 text-amber-500'}`}>
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-2xl font-black text-foreground">{profile?.streakCount ?? 0} days</span>
            <span className="block text-xs text-muted-foreground">
              {atRisk ? "At risk — you haven't practised today yet." : 'Streak is current.'}
            </span>
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Snowflake className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-2xl font-black text-foreground">{freezeCount} / {MAX_FREEZES}</span>
            <span className="block text-xs text-muted-foreground">
              Streak-freeze tokens — one forgives a missed day, earned every 7-day milestone.
            </span>
          </div>
        </div>
      </div>

      {/* Activity heatmap */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <h2 className="text-sm font-bold text-foreground">Activity, last 13 weeks</h2>
        <div className="overflow-x-auto">
          <div className="grid grid-flow-col grid-rows-7 gap-1 w-max">
            {heatmapDays.map((day) => (
              <div
                key={day}
                title={`${day}: ${heatmap[day] ?? 0} actions`}
                className={`w-3 h-3 rounded-sm ${heatColor(heatmap[day] ?? 0)}`}
              />
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Each cell is one day; darker means more reviews, memorization drills, and reading recorded that day.
        </p>
      </div>

      {/* Smart goals */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <span>Goals</span>
          </h2>
          <button
            type="button"
            onClick={() => setShowGoalForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New goal</span>
          </button>
        </div>

        {/* Deadline (dated) goal form */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5 text-primary" />
            <span>Finish by a date</span>
          </h3>
          <button
            type="button"
            onClick={() => setShowDeadlineForm((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold"
          >
            {showDeadlineForm ? 'Cancel' : 'Set deadline goal'}
          </button>
        </div>

        {showDeadlineForm && (
          <div className="p-4 rounded-xl bg-surface border border-border space-y-3 text-xs">
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground font-medium">From surah</span>
                <select
                  value={deadlineFromSurah}
                  onChange={(e) => setDeadlineFromSurah(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border font-semibold"
                >
                  {SURAHS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}. {s.nameSimple}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground font-medium">To surah</span>
                <select
                  value={deadlineToSurah}
                  onChange={(e) => setDeadlineToSurah(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border font-semibold"
                >
                  {SURAHS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}. {s.nameSimple}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground font-medium">Complete by</span>
                <input
                  type="date"
                  value={deadlineDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border font-semibold"
                />
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The ayah target is counted from the surah range you pick, so you never hand-count it.
            </p>
            <button
              type="button"
              onClick={() => void handleCreateDeadlineGoal()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold"
            >
              Create deadline goal
            </button>
          </div>
        )}

        {deadlineStatus && <p className="text-[11px] text-success-strong">{deadlineStatus}</p>}

        {showGoalForm && (
          <div className="p-4 rounded-xl bg-surface border border-border space-y-3 text-xs">
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground font-medium">Kind</span>
                <select
                  value={goalKind}
                  onChange={(e) => setGoalKind(e.target.value as HifzGoalKind)}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border font-semibold"
                >
                  <option value="memorize">Memorize</option>
                  <option value="review">Review</option>
                  <option value="read">Read</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground font-medium">Cadence</span>
                <select
                  value={goalCadence}
                  onChange={(e) => setGoalCadence(e.target.value as HifzGoalCadence)}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border font-semibold"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              {goalCadence === 'weekly' && (
                <label className="flex flex-col gap-1">
                  <span className="text-muted-foreground font-medium">Weekday</span>
                  <select
                    value={goalWeekday}
                    onChange={(e) => setGoalWeekday(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg bg-background border border-border font-semibold"
                  >
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <option key={label} value={idx}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground font-medium">Target ayahs</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(Number(e.target.value))}
                  className="w-24 px-2.5 py-1.5 rounded-lg bg-background border border-border font-semibold"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void handleCreateGoal()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold"
            >
              Create goal
            </button>
          </div>
        )}

        {goalProgress.length === 0 ? (
          <p className="text-xs text-muted-foreground">No goals yet. Set one to track a memorize, review or reading target.</p>
        ) : (
          <div className="space-y-2">
            {goalProgress.map(({ goal, done, isComplete, daysRemaining, behindBy, requiredPerDay }) => {
              const percent = Math.min(100, Math.round((done / goal.targetAyahs) * 100));
              const overdue = daysRemaining !== undefined && daysRemaining < 0;
              return (
                <div key={goal.id} className={`p-3 rounded-xl bg-surface border ${overdue ? 'border-warning/50' : 'border-border'}`}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
                      {goalLabel(goal)}
                      {goal.cadence === 'weekly' && goal.weekday !== undefined && (
                        <span className="text-muted-foreground font-normal">({WEEKDAY_LABELS[goal.weekday]})</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{done} / {goal.targetAyahs}</span>
                      <button
                        type="button"
                        onClick={() => void archiveGoal(goal.id)}
                        title="Archive"
                        className="p-1 rounded-md text-muted-foreground hover:bg-muted"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteGoal(goal.id)}
                        title="Delete"
                        className="p-1 rounded-md text-muted-foreground hover:text-danger-strong hover:bg-danger-subtle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${isComplete ? 'bg-success' : overdue ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${percent}%` }} />
                  </div>
                  {/* Deadline countdown + gap action */}
                  {daysRemaining !== undefined && (
                    <div className="mt-2 space-y-1.5">
                      {overdue ? (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-warning-strong font-semibold">
                            Deadline passed — extend or archive?
                          </span>
                          <span className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void (async () => {
                                  const d = new Date();
                                  d.setDate(d.getDate() + 30);
                                  const next = d.toISOString().slice(0, 10);
                                  await db.hifzGoals.update(goal.id, { deadline: next });
                                  track('goal.extend_or_archived', { action: 'extended' });
                                })();
                              }}
                              className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold"
                            >
                              +30 days
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void archiveGoal(goal.id).then(() => track('goal.extend_or_archived', { action: 'archived' }));
                              }}
                              className="px-2 py-0.5 rounded-md bg-muted text-foreground font-bold"
                            >
                              Archive
                            </button>
                          </span>
                        </div>
                      ) : (
                        <>
                          <span className="block text-[11px] text-muted-foreground">
                            {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
                            {behindBy !== undefined && behindBy > 0 ? ` · ${behindBy} ayah${behindBy === 1 ? '' : 's'} behind pace` : ''}
                          </span>
                          {behindBy !== undefined && behindBy > 0 && requiredPerDay !== undefined && (
                            <button
                              type="button"
                              onClick={() => void bumpPlannerPace(requiredPerDay)}
                              className="px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold"
                            >
                              Raise planner pace to {requiredPerDay}/day
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mistake map */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <span>Weak surahs</span>
        </h2>
        {weakSurahs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No recitation mistakes recorded yet. Hidden-verse recitation (mode H) fills this in.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {weakSurahs.map(([surah, count]) => {
              const meta = SURAHS.find((s) => s.id === surah);
              const intensity =
                count >= 10
                  ? 'bg-danger-subtle text-danger-strong border-danger/40'
                  : count >= 4
                    ? 'bg-warning-subtle text-warning-strong border-warning/40'
                    : 'bg-surface text-foreground border-border';
              return (
                <Link
                  key={surah}
                  href={`/memorize?mode=H&surah=${surah}`}
                  onClick={() => track('mistakes.verse_jump', { surah })}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${intensity}`}
                  title={`${count} word mistakes recorded`}
                >
                  {meta?.nameSimple ?? `Surah ${surah}`} ({count})
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recitation replay history */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            <span>Recitation replay</span>
          </h2>
          <button
            type="button"
            onClick={() => setReplayOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-xs transition-colors"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            Browse saved attempts
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Attempts saved from hidden-verse recitation (mode H) can be replayed beside the Qari reference — stored on
          this device only, never uploaded.
        </p>
      </div>

      {/* Reminders */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <span>Daily practice reminder</span>
        </h2>
        {!notificationsSupported() ? (
          <p className="text-xs text-muted-foreground">This browser does not support notifications.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              A best-effort browser notification if nothing has been practised by this hour — only while the app is open
              in a tab, not a guaranteed background push.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground font-medium">Remind at</span>
                <select
                  value={reminderHour}
                  onChange={(e) => setReminderHour(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg bg-background border border-border font-semibold"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
              {profile?.reminderHour !== undefined && permission === 'granted' ? (
                <button
                  type="button"
                  onClick={() => void handleDisableReminder()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-bold"
                >
                  <BellOff className="w-3.5 h-3.5" />
                  <span>Turn off</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleEnableReminder()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Enable</span>
                </button>
              )}
            </div>
            {reminderStatus && <p className="text-[11px] text-muted-foreground">{reminderStatus}</p>}
            {permission === 'denied' && (
              <p className="text-[11px] text-danger-strong">
                Notifications are blocked for this site in your browser settings.
              </p>
            )}
          </>
        )}
      </div>

      <ReplayDrawer isOpen={replayOpen} onClose={() => setReplayOpen(false)} />
    </div>
  );
}
