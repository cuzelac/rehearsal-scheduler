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
import { useAppData } from '../useAppData';
import type { Scene } from '../types';

type Props = ReturnType<typeof useAppData>;

function SceneForm({
  roles,
  initial,
  onSave,
  onCancel,
}: {
  roles: Props['data']['roles'];
  initial?: Scene;
  onSave: (name: string, roleIds: string[]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
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
    if (!trimmed) return;
    onSave(trimmed, [...selectedRoles]);
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

function SortableSceneItem({
  scene,
  roles,
  isEditing,
  onEdit,
  onRemove,
  onUpdate,
  onCancelEdit,
}: {
  scene: Scene;
  roles: Props['data']['roles'];
  isEditing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<Omit<Scene, 'id'>>) => void;
  onCancelEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      {isEditing ? (
        <SceneForm
          roles={roles}
          initial={scene}
          onSave={(name, roleIds) => onUpdate({ name, roleIds })}
          onCancel={onCancelEdit}
        />
      ) : (
        <div className="scene-row">
          <span className="drag-handle" {...attributes} {...listeners}>⠿</span>
          <div className="scene-info">
            <span className="item-name">{scene.name}</span>
            <div className="scene-roles">
              {scene.roleIds.length === 0 ? (
                <span className="hint">No roles</span>
              ) : (
                scene.roleIds.map((rid) => {
                  const role = roles.find((r) => r.id === rid);
                  return role ? (
                    <span key={rid} className="chip selected small">{role.name}</span>
                  ) : null;
                })
              )}
            </div>
          </div>
          <div className="item-actions">
            <button className="btn-ghost" onClick={onEdit}>Edit</button>
            <button className="btn-ghost danger" onClick={onRemove}>Remove</button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ScenesPanel({ data, addScene, removeScene, updateScene, reorderScenes }: Props) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = data.scenes.map((s) => s.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    reorderScenes(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <div className="panel">
      <h2>Scene library</h2>
      <p className="hint">Define every scene once: its name and which roles appear. Durations are set per rehearsal in the Build tab.</p>

      {!adding && (
        <button onClick={() => setAdding(true)}>+ Add Scene</button>
      )}

      {adding && (
        <SceneForm
          roles={data.roles}
          onSave={(name, roleIds) => {
            addScene(name, roleIds);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {data.scenes.length === 0 && !adding && (
        <p className="empty">No scenes yet.</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={data.scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="item-list scenes-list">
            {data.scenes.map((scene) => (
              <SortableSceneItem
                key={scene.id}
                scene={scene}
                roles={data.roles}
                isEditing={editId === scene.id}
                onEdit={() => setEditId(scene.id)}
                onRemove={() => removeScene(scene.id)}
                onUpdate={(patch) => {
                  updateScene(scene.id, patch);
                  if (editId === scene.id) setEditId(null);
                }}
                onCancelEdit={() => setEditId(null)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
