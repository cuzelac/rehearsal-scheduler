import { useState } from 'react';
import { useRehearsal } from '../useRehearsal';
import type { Scene } from '../types';

type Props = ReturnType<typeof useRehearsal>;

function SceneForm({
  roles,
  initial,
  onSave,
  onCancel,
}: {
  roles: Props['rehearsal']['roles'];
  initial?: Scene;
  onSave: (name: string, duration: number, roleIds: string[]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [duration, setDuration] = useState(String(initial?.duration ?? ''));
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(initial?.roleIds ?? [])
  );

  function toggleRole(id: string) {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSave() {
    const trimmed = name.trim();
    const mins = parseInt(duration, 10);
    if (!trimmed || isNaN(mins) || mins <= 0) return;
    onSave(trimmed, mins, [...selectedRoles]);
  }

  return (
    <div className="scene-form">
      <div className="form-row">
        <label>Scene name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Act 1 Sc 3"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
      </div>
      <div className="form-row">
        <label>Duration (min)</label>
        <input
          type="number"
          min={1}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          style={{ width: 80 }}
        />
      </div>
      <div className="form-row roles-row">
        <label>Roles needed</label>
        <div className="role-chips">
          {roles.length === 0 && <span className="hint">Add roles first</span>}
          {roles.map((r) => (
            <button
              key={r.id}
              className={`chip${selectedRoles.has(r.id) ? ' selected' : ''}`}
              onClick={() => toggleRole(r.id)}
              type="button"
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>
      <div className="form-actions">
        <button onClick={handleSave}>Save</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function ScenesPanel({ rehearsal, addScene, removeScene, updateScene }: Props) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <div className="panel">
      <h2>Scenes</h2>
      <p className="hint">Add each scene with its duration and which roles are required.</p>

      {!adding && (
        <button onClick={() => setAdding(true)}>+ Add Scene</button>
      )}

      {adding && (
        <SceneForm
          roles={rehearsal.roles}
          onSave={(name, duration, roleIds) => {
            addScene(name, duration, roleIds);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {rehearsal.scenes.length === 0 && !adding && (
        <p className="empty">No scenes yet.</p>
      )}

      <ul className="item-list scenes-list">
        {rehearsal.scenes.map((scene) => (
          <li key={scene.id}>
            {editId === scene.id ? (
              <SceneForm
                roles={rehearsal.roles}
                initial={scene}
                onSave={(name, duration, roleIds) => {
                  updateScene(scene.id, { name, duration, roleIds });
                  setEditId(null);
                }}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <div className="scene-row">
                <div className="scene-info">
                  <span className="item-name">{scene.name}</span>
                  <span className="scene-duration">
                    <input
                      type="range"
                      min={5}
                      max={45}
                      step={5}
                      value={scene.duration}
                      onChange={(e) => updateScene(scene.id, { duration: Number(e.target.value) })}
                      className="duration-slider"
                    />
                    <span className="duration-label">{scene.duration}m</span>
                  </span>
                  <div className="scene-roles">
                    {scene.roleIds.length === 0 ? (
                      <span className="hint">No roles</span>
                    ) : (
                      scene.roleIds.map((rid) => {
                        const role = rehearsal.roles.find((r) => r.id === rid);
                        return role ? (
                          <span key={rid} className="chip selected small">{role.name}</span>
                        ) : null;
                      })
                    )}
                  </div>
                </div>
                <div className="item-actions">
                  <button className="btn-ghost" onClick={() => setEditId(scene.id)}>Edit</button>
                  <button className="btn-ghost danger" onClick={() => removeScene(scene.id)}>Remove</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
