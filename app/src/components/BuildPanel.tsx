import { useAppData } from '../useAppData';

type Props = ReturnType<typeof useAppData>;

function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function BuildPanel({
  data,
  currentRehearsal,
  toggleScene,
  setItemDuration,
  renameRehearsal,
  setRehearsalDate,
  setStartMinute,
  deleteRehearsal,
}: Props) {
  if (!currentRehearsal) {
    return (
      <div className="panel">
        <h2>Build</h2>
        <p className="empty">Create or select a rehearsal to build its scene list.</p>
      </div>
    );
  }

  const durationBySceneId = Object.fromEntries(
    currentRehearsal.items.map((it) => [it.sceneId, it.duration])
  );
  const includedCount = currentRehearsal.items.length;
  const totalMinutes = currentRehearsal.items.reduce((sum, it) => sum + it.duration, 0);

  return (
    <div className="panel">
      <h2>Build rehearsal</h2>
      <p className="hint">Pick which scenes this rehearsal covers and how long to spend on each. Order is set in the Schedule tab.</p>

      <div className="rehearsal-meta">
        <input
          className="rehearsal-name"
          value={currentRehearsal.name}
          onChange={(e) => renameRehearsal(currentRehearsal.id, e.target.value)}
          placeholder="Rehearsal name"
        />
        <input
          type="date"
          value={currentRehearsal.date}
          onChange={(e) => setRehearsalDate(currentRehearsal.id, e.target.value)}
        />
        <label className="meta-time">
          Start
          <input
            type="time"
            value={`${String(Math.floor(currentRehearsal.startMinute / 60)).padStart(2, '0')}:${String(currentRehearsal.startMinute % 60).padStart(2, '0')}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              setStartMinute(h * 60 + (m || 0));
            }}
          />
        </label>
        <button
          className="btn-ghost danger"
          onClick={() => {
            if (confirm(`Delete rehearsal “${currentRehearsal.name}”? This can’t be undone.`)) {
              deleteRehearsal(currentRehearsal.id);
            }
          }}
        >
          Delete rehearsal
        </button>
      </div>

      <p className="build-summary">
        {includedCount} {includedCount === 1 ? 'scene' : 'scenes'} · {fmtDuration(totalMinutes)}
      </p>

      {data.scenes.length === 0 && (
        <p className="empty">No scenes in the library yet — add some in the Scenes tab.</p>
      )}

      <ul className="item-list build-list">
        {data.scenes.map((scene) => {
          const included = scene.id in durationBySceneId;
          const duration = durationBySceneId[scene.id] ?? 0;
          return (
            <li key={scene.id} className={included ? '' : 'excluded'}>
              <div className="build-row">
                <button
                  className={`include-toggle${included ? ' included' : ''}`}
                  onClick={() => toggleScene(scene.id)}
                  title={included ? 'In this rehearsal — click to remove' : 'Not in this rehearsal — click to add'}
                  aria-pressed={included}
                >
                  {included ? '✓ In' : 'Add'}
                </button>
                <div className="build-main">
                  <span className="item-name">{scene.name}</span>
                  {included && (
                    <span className="scene-duration">
                      <input
                        type="range"
                        min={5}
                        max={Math.max(60, duration)}
                        step={5}
                        value={duration}
                        onChange={(e) => setItemDuration(scene.id, Number(e.target.value))}
                        className="duration-slider"
                      />
                      <span className="duration-value">
                        <input
                          type="number"
                          min={1}
                          value={duration}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v > 0) setItemDuration(scene.id, v);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          className="duration-input"
                          title="Minutes — drag the slider or type any value"
                        />
                        <span className="duration-unit">m</span>
                      </span>
                    </span>
                  )}
                  <div className="scene-roles">
                    {scene.roleIds.map((rid) => {
                      const role = data.roles.find((r) => r.id === rid);
                      return role ? (
                        <span key={rid} className="chip selected small">{role.name}</span>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
