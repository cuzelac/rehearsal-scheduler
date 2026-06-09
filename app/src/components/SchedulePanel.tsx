import { useState } from 'react';
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
import { useRehearsal } from '../useRehearsal';
import { computeMetrics, computeRoleChipColors } from '../scheduler';
import type { ChipColor } from '../scheduler';
import type { Scene } from '../types';

type Props = ReturnType<typeof useRehearsal>;

function SortableSceneRow({
  scene,
  index,
  startMinute,
  roles,
  chipColors,
}: {
  scene: Scene;
  index: number;
  startMinute: number;
  roles: Props['rehearsal']['roles'];
  chipColors: Record<string, ChipColor>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const endMinute = startMinute + scene.duration;

  function fmt(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return (
    <li ref={setNodeRef} style={style} className="schedule-row">
      <span className="drag-handle" {...attributes} {...listeners}>⠿</span>
      <span className="scene-index">{index + 1}</span>
      <div className="schedule-scene-info">
        <span className="item-name">{scene.name}</span>
        <span className="scene-duration">{scene.duration} min</span>
        <span className="time-range">{fmt(startMinute)} – {fmt(endMinute)}</span>
      </div>
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
    </li>
  );
}

type SortKey = 'role' | 'call' | 'release' | 'idle';
type SortDir = 'asc' | 'desc';

function IdleSummary({
  orderedScenes,
  roles,
  startMinute,
}: {
  orderedScenes: Scene[];
  roles: Props['rehearsal']['roles'];
  startMinute: number;
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

  function fmtTime(offsetMinutes: number) {
    const total = startMinute + offsetMinutes;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

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
    else if (sortKey === 'idle') cmp = a.idleMinutes - b.idleMinutes;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="idle-summary">
      <div className="summary-header">
        <span>Total rehearsal: <strong>{fmtDuration(metrics.totalDuration)}</strong></span>
        <span className={metrics.totalIdleMinutes > 0 ? 'idle-warn' : 'idle-ok'}>
          Total idle: <strong>{fmtDuration(metrics.totalIdleMinutes)}</strong>
        </span>
      </div>
      <table className="idle-table">
        <thead>
          <tr>
            <th className="sortable" onClick={() => handleSort('role')}>Role {sortIndicator('role')}</th>
            <th className="sortable" onClick={() => handleSort('call')}>Call {sortIndicator('call')}</th>
            <th className="sortable" onClick={() => handleSort('release')}>Release {sortIndicator('release')}</th>
            <th className="sortable" onClick={() => handleSort('idle')}>Idle {sortIndicator('idle')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((span) => {
              const role = roles.find((r) => r.id === span.roleId);
              return (
                <tr key={span.roleId} className={span.idleMinutes > 0 ? 'idle-row' : ''}>
                  <td>{role?.name ?? span.roleId}</td>
                  <td>{fmtTime(span.firstCall)}</td>
                  <td>{fmtTime(span.lastRelease)}</td>
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
  orderedScenes: Scene[],
  roles: Props['rehearsal']['roles'],
  startMinute: number
): string {
  const metrics = computeMetrics(orderedScenes);

  function fmt(minutes: number) {
    const total = startMinute + minutes;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

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

export function SchedulePanel({ rehearsal, reorderSchedule, runAutoSchedule, setStartMinute }: Props) {
  const startMinute = rehearsal.startMinute;
  const [copied, setCopied] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  const sceneMap = Object.fromEntries(rehearsal.scenes.map((s) => [s.id, s]));
  const orderedScenes = rehearsal.schedule
    .map((id) => sceneMap[id])
    .filter(Boolean) as Scene[];

  const allChipColors = computeRoleChipColors(orderedScenes);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rehearsal.schedule.indexOf(String(active.id));
    const newIndex = rehearsal.schedule.indexOf(String(over.id));
    reorderSchedule(arrayMove(rehearsal.schedule, oldIndex, newIndex));
  }

  async function handleCopy() {
    const text = buildEmailText(orderedScenes, rehearsal.roles, startMinute);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (rehearsal.scenes.length === 0) {
    return (
      <div className="panel">
        <h2>Schedule</h2>
        <p className="empty">Add scenes first.</p>
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
        <div className="start-time-row">
          <label>Rehearsal start</label>
          <input
            type="time"
            value={`${String(Math.floor(startMinute / 60)).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              setStartMinute(h * 60 + (m || 0));
            }}
          />
        </div>
        <div className="schedule-buttons">
          <button onClick={runAutoSchedule}>Auto-optimize</button>
          <button className="btn-ghost" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy for email'}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rehearsal.schedule} strategy={verticalListSortingStrategy}>
          <ul className="schedule-list">
            {orderedScenes.map((scene, i) => (
              <SortableSceneRow
                key={scene.id}
                scene={scene}
                index={i}
                startMinute={startMinute + sceneStarts[i]}
                roles={rehearsal.roles}
                chipColors={allChipColors[scene.id] ?? {}}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <IdleSummary orderedScenes={orderedScenes} roles={rehearsal.roles} startMinute={startMinute} />
    </div>
  );
}
