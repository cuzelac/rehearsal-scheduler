import { useState } from 'react';
import { useRehearsal } from './useRehearsal';
import { RolesPanel } from './components/RolesPanel';
import { ScenesPanel } from './components/ScenesPanel';
import { SchedulePanel } from './components/SchedulePanel';
import './App.css';

type Tab = 'roles' | 'scenes' | 'schedule';

export default function App() {
  const [tab, setTab] = useState<Tab>('roles');
  const state = useRehearsal();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <h1>Rehearsal Scheduler</h1>
          {state.rehearsal.scenes.length > 0 && (
            <span className="total-duration">
              {(() => {
                const total = state.rehearsal.scenes.reduce((s, sc) => s + sc.duration, 0);
                const h = Math.floor(total / 60);
                const m = total % 60;
                return h > 0 ? `${h}h ${m}m total` : `${m}m total`;
              })()}
            </span>
          )}
        </div>
        <nav className="app-nav">
          {(['roles', 'scenes', 'schedule'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`nav-btn${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'roles' && state.rehearsal.roles.length > 0 && (
                <span className="badge">{state.rehearsal.roles.length}</span>
              )}
              {t === 'scenes' && state.rehearsal.scenes.length > 0 && (
                <span className="badge">{state.rehearsal.scenes.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {tab === 'roles' && <RolesPanel {...state} />}
        {tab === 'scenes' && <ScenesPanel {...state} />}
        {tab === 'schedule' && <SchedulePanel {...state} />}
      </main>
    </div>
  );
}
