import { useState, useRef } from 'react';
import { useAppData } from './useAppData';
import { RolesPanel } from './components/RolesPanel';
import { ScenesPanel } from './components/ScenesPanel';
import { BuildPanel } from './components/BuildPanel';
import { SchedulePanel } from './components/SchedulePanel';
import './App.css';

type Tab = 'roles' | 'scenes' | 'build' | 'schedule';
const TABS: { key: Tab; label: string }[] = [
  { key: 'roles', label: 'Roles' },
  { key: 'scenes', label: 'Scenes' },
  { key: 'build', label: 'Build' },
  { key: 'schedule', label: 'Schedule' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('roles');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const state = useAppData();
  const { data, currentRehearsal } = state;

  const currentTotal = currentRehearsal
    ? currentRehearsal.items.reduce((s, it) => s + it.duration, 0)
    : 0;

  function fmtTotal(min: number) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m total` : `${m}m total`;
  }

  function handleCreate() {
    const name = newName.trim() || `Rehearsal ${data.rehearsals.length + 1}`;
    state.createRehearsal(name, new Date().toISOString().slice(0, 10));
    setNewName('');
    setCreating(false);
    setTab('build');
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <h1>Rehearsal Scheduler</h1>
          {currentRehearsal && currentTotal > 0 && (
            <span className="total-duration">{fmtTotal(currentTotal)}</span>
          )}
          <div className="header-tools">
            <button className="btn-ghost" onClick={state.exportData} title="Download all data as JSON">Export</button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} title="Replace all data from a JSON file">Import</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) state.importData(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="rehearsal-bar">
          <label className="rehearsal-bar-label">Rehearsal</label>
          <select
            className="rehearsal-select"
            value={currentRehearsal?.id ?? ''}
            onChange={(e) => state.selectRehearsal(e.target.value)}
            disabled={data.rehearsals.length === 0}
          >
            {data.rehearsals.length === 0 && <option value="">No rehearsals yet</option>}
            {data.rehearsals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.date ? ` — ${r.date}` : ''}
              </option>
            ))}
          </select>
          {creating ? (
            <span className="rehearsal-create">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder="New rehearsal name…"
              />
              <button onClick={handleCreate}>Create</button>
              <button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            </span>
          ) : (
            <button className="btn-ghost" onClick={() => setCreating(true)}>+ New</button>
          )}
        </div>

        <nav className="app-nav">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`nav-btn${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === 'roles' && data.roles.length > 0 && (
                <span className="badge">{data.roles.length}</span>
              )}
              {t.key === 'scenes' && data.scenes.length > 0 && (
                <span className="badge">{data.scenes.length}</span>
              )}
              {t.key === 'build' && currentRehearsal && currentRehearsal.items.length > 0 && (
                <span className="badge">{currentRehearsal.items.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {data.rehearsals.length === 0 && tab !== 'roles' && tab !== 'scenes' && (
          <div className="panel">
            <p className="empty">No rehearsals yet. Create one to start building a schedule.</p>
            <button onClick={() => setCreating(true)}>+ New rehearsal</button>
          </div>
        )}
        {tab === 'roles' && <RolesPanel {...state} />}
        {tab === 'scenes' && <ScenesPanel {...state} />}
        {tab === 'build' && (data.rehearsals.length > 0 || currentRehearsal) && <BuildPanel {...state} />}
        {tab === 'schedule' && (data.rehearsals.length > 0 || currentRehearsal) && <SchedulePanel {...state} />}
      </main>
    </div>
  );
}
