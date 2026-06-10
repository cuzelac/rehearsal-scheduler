import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppData } from '../useAppData';
import { computeMetrics, computeRoleChipColors } from '../scheduler';
import type { ChipColor } from '../scheduler';
import type { ScheduledScene, Objective } from '../types';

type Props = ReturnType<typeof useAppData>;

// Format an absolute minutes-from-midnight value in 12h or 24h.
function formatClock(totalMinutes: number, clock24: boolean): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  if (clock24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function SortableSceneRow({
  scene,
  index,
  startMinute,
  roles,
  chipColors,
  clock24,
}: {
  scene: ScheduledScene;
  index: number;
  startMinute: number;
  roles: Props['data']['roles'];
  chipColors: Record<string, ChipColor>;
  clock24: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const endMinute = startMinute + scene.duration;

  return (
    <li ref={setNodeRef} style={style} className="schedule-row">
      <span className="drag-handle" {...attributes} {...listeners}>⠿</span>
      <span className="scene-index">{index + 1}</span>
      <div className="schedule-main">
        <span className="item-name">{scene.name}</span>
        <span className="scene-meta">
          {formatClock(startMinute, clock24)} – {formatClock(endMinute, clock24)} · {scene.duration} min
        </span>
        <div className="schedule-roles">
          {scene.roleIds.map((rid) => {
            const role = roles.find((r) => r.id === rid);
            if (!role) return null;
            const color = chipColors[rid];
            const colorClass = color ? ` chip-${color}` : '';
            const titles: Record<string, string> = {
              green: 'First call',
              red: 'Last call',
              yellow: 'Returns after a break',
            };
            return (
              <span
                key={rid}
                className={`chip small${colorClass}`}
                title={titles[color] ?? ''}
              >
                {role.name}
              </span>
            );
          })}
        </div>
      </div>
    </li>
  );
}

type SortKey = 'role' | 'call' | 'release' | 'calltime' | 'idle';
type SortDir = 'asc' | 'desc';

function IdleSummary({
  orderedScenes,
  roles,
  startMinute,
  objective,
  clock24,
}: {
  orderedScenes: ScheduledScene[];
  roles: Props['data']['roles'];
  startMinute: number;
  objective: Objective;
  clock24: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('call');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const metrics = computeMetrics(orderedScenes);

  if (roles.length === 0 || orderedScenes.length === 0) return null;

  function fmtDuration(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const fmtTime = (offsetMinutes: number) => formatClock(startMinute + offsetMinutes, clock24);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'role' ? 'asc' : 'asc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return <span className="sort-arrow inactive">↕</span>;
    return <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const sorted = [...metrics.roleSpans].sort((a, b) => {
    const roleName = (span: typeof a) =>
      roles.find((r) => r.id === span.roleId)?.name ?? '';
    let cmp = 0;
    if (sortKey === 'role') cmp = roleName(a).localeCompare(roleName(b));
    else if (sortKey === 'call') cmp = a.firstCall - b.firstCall;
    else if (sortKey === 'release') cmp = a.lastRelease - b.lastRelease;
    else if (sortKey === 'calltime') cmp = (a.lastRelease - a.firstCall) - (b.lastRelease - b.firstCall);
    else if (sortKey === 'idle') cmp = a.idleMinutes - b.idleMinutes;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const paidSet = new Set(roles.filter((r) => r.paid).map((r) => r.id));
  const idles = metrics.roleSpans.map((s) => s.idleMinutes);
  const totalCallTime = metrics.roleSpans.reduce((sum, s) => sum + (s.lastRelease - s.firstCall), 0);
  const paidCallTime = metrics.roleSpans.reduce(
    (sum, s) => (paidSet.has(s.roleId) ? sum + (s.lastRelease - s.firstCall) : sum),
    0
  );
  const worstIdle = idles.length ? Math.max(...idles) : 0;
  const meanIdle = idles.length ? idles.reduce((a, b) => a + b, 0) / idles.length : 0;
  const spreadIdle = idles.length
    ? Math.sqrt(idles.reduce((a, x) => a + (x - meanIdle) ** 2, 0) / idles.length)
    : 0;

  return (
    <div className="idle-summary">
      <div className="summary-header">
        <span>Total rehearsal: <strong>{fmtDuration(metrics.totalDuration)}</strong></span>
        <span className="metric" title="Sum of every role's call time (release − call), i.e. total hours the cast is held">
          Total call time: <strong>{fmtDuration(totalCallTime)}</strong>
        </span>
        <span className={`metric${objective === 'cost' ? ' active' : ''}`} title="Total held hours across paid roles only — the cost-relevant number">
          Paid call time: <strong>{fmtDuration(paidCallTime)}</strong>
        </span>
        <span className={`metric${objective === 'total' ? ' active' : ''}`} title="Sum of every role's idle time">
          Total idle: <strong>{fmtDuration(metrics.totalIdleMinutes)}</strong>
        </span>
        <span className={`metric${objective === 'minimax' ? ' active' : ''}`} title="Largest idle any single role suffers">
          Worst role: <strong>{fmtDuration(worstIdle)}</strong>
        </span>
        <span className={`metric${objective === 'spread' ? ' active' : ''}`} title="Standard deviation of idle across roles">
          Spread: <strong>{fmtDuration(Math.round(spreadIdle))}</strong>
        </span>
      </div>
      <table className="idle-table">
        <thead>
          <tr>
            <th className="sortable" onClick={() => handleSort('role')}>Role {sortIndicator('role')}</th>
            <th className="sortable" onClick={() => handleSort('call')}>Call {sortIndicator('call')}</th>
            <th className="sortable" onClick={() => handleSort('release')}>Release {sortIndicator('release')}</th>
            <th className="sortable" onClick={() => handleSort('calltime')}>Call time {sortIndicator('calltime')}</th>
            <th className="sortable" onClick={() => handleSort('idle')}>Idle {sortIndicator('idle')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((span) => {
              const role = roles.find((r) => r.id === span.roleId);
              const isVolunteer = role ? !role.paid : false;
              return (
                <tr key={span.roleId} className={span.idleMinutes > 0 ? 'idle-row' : ''}>
                  <td>
                    {role?.name ?? span.roleId}
                    {isVolunteer && <span className="volunteer-tag">volunteer</span>}
                  </td>
                  <td>{fmtTime(span.firstCall)}</td>
                  <td>{fmtTime(span.lastRelease)}</td>
                  <td>{fmtDuration(span.lastRelease - span.firstCall)}</td>
                  <td className={span.idleMinutes > 0 ? 'idle-warn' : ''}>
                    {span.idleMinutes > 0 ? fmtDuration(span.idleMinutes) : '—'}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function buildEmailText(
  orderedScenes: ScheduledScene[],
  roles: Props['data']['roles'],
  startMinute: number,
  clock24: boolean
): string {
  const metrics = computeMetrics(orderedScenes);

  const fmt = (minutes: number) => formatClock(startMinute + minutes, clock24);

  const lines: string[] = [];
  lines.push('REHEARSAL SCHEDULE');
  lines.push('==================');
  lines.push('');
  lines.push('SCENE ORDER:');
  let elapsed = 0;
  for (const scene of orderedScenes) {
    const sceneRoles = scene.roleIds
      .map((rid) => roles.find((r) => r.id === rid)?.name)
      .filter(Boolean)
      .join(', ');
    lines.push(`  ${fmt(elapsed)} – ${fmt(elapsed + scene.duration)}  ${scene.name} (${scene.duration} min)`);
    if (sceneRoles) lines.push(`    Roles: ${sceneRoles}`);
    elapsed += scene.duration;
  }

  lines.push('');
  lines.push('ROLE CALLS:');
  const sorted = [...metrics.roleSpans].sort((a, b) => a.firstCall - b.firstCall);
  for (const span of sorted) {
    const role = roles.find((r) => r.id === span.roleId);
    const idleStr = span.idleMinutes > 0 ? ` (${span.idleMinutes} min idle)` : '';
    lines.push(`  ${role?.name ?? span.roleId}: arrive ${fmt(span.firstCall)}, done by ${fmt(span.lastRelease)}${idleStr}`);
  }

  return lines.join('\n');
}

const OBJECTIVES: { key: Objective; label: string; caption: string; title: string }[] = [
  { key: 'total', label: 'Total idle', caption: 'Least combined waiting across everyone.', title: 'Minimize the sum of all roles’ idle time (provably optimal)' },
  { key: 'minimax', label: 'Worst-off role', caption: 'No single actor gets stranded waiting.', title: 'Minimize the largest idle any one role suffers' },
  { key: 'spread', label: 'Even spread', caption: 'Everyone waits about the same amount.', title: 'Even out idle time across all roles' },
  { key: 'cost', label: 'Lowest paid cost', caption: 'Least held time for the paid cast (volunteers don’t count).', title: 'Minimize total call time of paid roles; volunteers are ignored' },
];

export function SchedulePanel({ data, currentRehearsal, resolvedScenes, reorderSchedule, runAutoSchedule, setObjective, setClock24, optimizing, optimizeProgress }: Props) {
  const [copied, setCopied] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [emailText, setEmailText] = useState('');
  const clock24 = data.clock24;

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    if (!showEmail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowEmail(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showEmail]);

  if (!currentRehearsal) {
    return (
      <div className="panel">
        <h2>Schedule</h2>
        <p className="empty">Create or select a rehearsal first.</p>
      </div>
    );
  }

  const startMinute = currentRehearsal.startMinute;
  const objective = currentRehearsal.objective;
  const orderedScenes = resolvedScenes(); // ScheduledScene[] in schedule order
  const scheduleIds = orderedScenes.map((s) => s.id);

  const allChipColors = computeRoleChipColors(orderedScenes);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scheduleIds.indexOf(String(active.id));
    const newIndex = scheduleIds.indexOf(String(over.id));
    reorderSchedule(arrayMove(scheduleIds, oldIndex, newIndex));
  }

  function openEmailPreview() {
    setEmailText(buildEmailText(orderedScenes, data.roles, startMinute, clock24));
    setCopied(false);
    setShowEmail(true);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (orderedScenes.length === 0) {
    return (
      <div className="panel">
        <h2>Schedule</h2>
        <p className="empty">No scenes in this rehearsal yet — add some in the Build tab.</p>
      </div>
    );
  }

  let elapsed = 0;
  const sceneStarts: number[] = orderedScenes.map((scene) => {
    const start = elapsed;
    elapsed += scene.duration;
    return start;
  });

  return (
    <div className="panel">
      <h2>Schedule</h2>

      <div className="schedule-controls">
        <div className="schedule-controls-left">
          <span className="schedule-start-note">Starts {formatClock(startMinute, clock24)} · set in Build</span>
          <div className="segmented clock-toggle" role="group" aria-label="Clock format">
            <button
              type="button"
              className={`segment${!clock24 ? ' active' : ''}`}
              onClick={() => setClock24(false)}
              title="12-hour clock (AM/PM)"
            >
              12h
            </button>
            <button
              type="button"
              className={`segment${clock24 ? ' active' : ''}`}
              onClick={() => setClock24(true)}
              title="24-hour clock"
            >
              24h
            </button>
          </div>
        </div>
        <div className="schedule-buttons">
          <button onClick={runAutoSchedule} disabled={optimizing}>
            {optimizing ? 'Optimizing…' : 'Auto-optimize'}
          </button>
          <button className="btn-ghost" onClick={openEmailPreview} disabled={optimizing}>
            Preview email
          </button>
        </div>
      </div>

      <div className="objective-row">
        <span className="objective-label">Optimize for</span>
        <div className="segmented" role="group" aria-label="Optimization objective">
          {OBJECTIVES.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`segment${objective === o.key ? ' active' : ''}`}
              onClick={() => setObjective(o.key)}
              disabled={optimizing}
              title={o.title}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="objective-caption">
          {OBJECTIVES.find((o) => o.key === objective)?.caption}
        </span>
      </div>

      {optimizing && (
        <div className="optimize-progress" role="progressbar" aria-valuenow={Math.round(optimizeProgress * 100)}>
          <div className="optimize-bar" style={{ width: `${Math.round(optimizeProgress * 100)}%` }} />
          <span className="optimize-pct">{Math.round(optimizeProgress * 100)}%</span>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scheduleIds} strategy={verticalListSortingStrategy}>
          <ul className="schedule-list">
            {orderedScenes.map((scene, i) => (
              <SortableSceneRow
                key={scene.id}
                scene={scene}
                index={i}
                startMinute={startMinute + sceneStarts[i]}
                roles={data.roles}
                chipColors={allChipColors[scene.id] ?? {}}
                clock24={clock24}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <IdleSummary orderedScenes={orderedScenes} roles={data.roles} startMinute={startMinute} objective={objective} clock24={clock24} />

      {showEmail && (
        <div className="modal-backdrop" onClick={() => setShowEmail(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Email preview</h3>
              <button className="modal-close" onClick={() => setShowEmail(false)} aria-label="Close">✕</button>
            </div>
            <textarea
              className="email-preview"
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              spellCheck={false}
            />
            <div className="modal-actions">
              <span className="modal-hint">Edits here are copied as-is, not saved.</span>
              <button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
              <button className="btn-ghost" onClick={() => setShowEmail(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
