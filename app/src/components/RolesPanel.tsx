import { useState } from 'react';
import { useRehearsal } from '../useRehearsal';

type Props = ReturnType<typeof useRehearsal>;

export function RolesPanel({ rehearsal, addRole, removeRole, updateRole, setRolePaid }: Props) {
  const [input, setInput] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  function handleAdd() {
    const name = input.trim();
    if (!name) return;
    addRole(name);
    setInput('');
  }

  function startEdit(id: string, name: string) {
    setEditId(id);
    setEditName(name);
  }

  function commitEdit() {
    if (editId && editName.trim()) {
      updateRole(editId, editName.trim());
    }
    setEditId(null);
  }

  return (
    <div className="panel">
      <h2>Roles</h2>
      <p className="hint">Add every role that will be called to this rehearsal.</p>

      <div className="add-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Role name…"
        />
        <button onClick={handleAdd}>Add</button>
      </div>

      {rehearsal.roles.length === 0 && (
        <p className="empty">No roles yet.</p>
      )}

      <ul className="item-list">
        {rehearsal.roles.map((role) => (
          <li key={role.id}>
            {editId === role.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditId(null);
                  }}
                  onBlur={commitEdit}
                />
              </>
            ) : (
              <>
                <span className="item-name">{role.name}</span>
                <button
                  className={`pay-toggle${role.paid ? ' paid' : ''}`}
                  onClick={() => setRolePaid(role.id, !role.paid)}
                  title={role.paid ? 'Paid — counts toward cost. Click to mark volunteer.' : 'Volunteer — excluded from cost. Click to mark paid.'}
                >
                  {role.paid ? 'Paid' : 'Volunteer'}
                </button>
                <div className="item-actions">
                  <button className="btn-ghost" onClick={() => startEdit(role.id, role.name)}>Edit</button>
                  <button className="btn-ghost danger" onClick={() => removeRole(role.id)}>Remove</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
