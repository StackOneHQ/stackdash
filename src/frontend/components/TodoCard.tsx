import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Todo, Assignee } from '../types';

interface TodoCardProps {
  todo: Todo;
  userMap: Map<string, Assignee>;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate?: (updates: Partial<Todo>) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}

export function TodoCard({
  todo,
  userMap,
  onToggle,
  onDelete,
  onUpdate,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: TodoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(todo.description);
  const [editSteps, setEditSteps] = useState<string[]>(todo.steps);
  const [editAssigneeId, setEditAssigneeId] = useState<string>(todo.assignee?.id || '');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showAssigneeDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAssigneeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAssigneeDropdown]);

  // Convert userMap to array for dropdown
  const users = useMemo(() => Array.from(userMap.values()), [userMap]);

  // Get enriched assignee data from userMap
  const assignee = useMemo(() => {
    const todoAssignee = todo.assignee;
    if (!todoAssignee) return null;

    // Look up the user in the userMap to get name/email
    const user = userMap.get(todoAssignee.id);
    if (user) {
      return {
        id: todoAssignee.id,
        name: todoAssignee.name || user.name,
        email: todoAssignee.email || user.email,
      };
    }
    return todoAssignee;
  }, [todo.assignee, userMap]);

  const handleSave = () => {
    if (onUpdate && editTitle.trim()) {
      const selectedUser = editAssigneeId ? userMap.get(editAssigneeId) : undefined;
      onUpdate({
        title: editTitle.trim(),
        description: editDescription.trim(),
        steps: editSteps.filter(s => s.trim() !== ''),
        assignee: selectedUser,
      });
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditTitle(todo.title);
    setEditDescription(todo.description);
    setEditSteps(todo.steps);
    setEditAssigneeId(todo.assignee?.id || '');
    setIsEditing(false);
  };

  const handleAddStep = () => {
    setEditSteps([...editSteps, '']);
  };

  const handleRemoveStep = (index: number) => {
    setEditSteps(editSteps.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, value: string) => {
    const newSteps = [...editSteps];
    newSteps[index] = value;
    setEditSteps(newSteps);
  };

  const handleAssigneeChange = (user: Assignee | null) => {
    if (onUpdate) {
      onUpdate({ assignee: user || undefined });
    }
    setShowAssigneeDropdown(false);
  };

  if (isEditing) {
    return (
      <div className="todo-card todo-edit-mode">
        <div className="todo-edit-field">
          <label>Title</label>
          <input
            type="text"
            className="todo-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Todo title"
            autoFocus
          />
        </div>

        <div className="todo-edit-field">
          <label>Description</label>
          <textarea
            className="todo-textarea"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
          />
        </div>

        <div className="todo-edit-field">
          <label>Assignee</label>
          <select
            className="todo-select"
            value={editAssigneeId}
            onChange={(e) => setEditAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.name || user.email || user.id}
              </option>
            ))}
          </select>
        </div>

        <div className="todo-edit-field">
          <label>Steps</label>
          <div className="todo-steps-edit">
            {editSteps.map((step, index) => (
              <div key={index} className="todo-step-input-row">
                <input
                  type="text"
                  className="todo-step-input"
                  value={step}
                  onChange={(e) => handleStepChange(index, e.target.value)}
                  placeholder={`Step ${index + 1}`}
                />
                <button
                  type="button"
                  className="todo-step-remove"
                  onClick={() => handleRemoveStep(index)}
                  title="Remove step"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="todo-add-step-btn"
              onClick={handleAddStep}
            >
              + Add step
            </button>
          </div>
        </div>

        <div className="todo-edit-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const cardClassName = [
    'todo-card',
    todo.completed ? 'completed' : '',
    isDragging ? 'dragging' : '',
    isDragOver ? 'drag-over' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClassName}
      draggable={!todo.completed}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="todo-header">
        <div
          className={`todo-checkbox ${todo.completed ? 'checked' : ''}`}
          onClick={onToggle}
          role="checkbox"
          aria-checked={todo.completed}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
        />
        <span className={`todo-title ${todo.completed ? 'completed' : ''}`}>
          {todo.title}
        </span>
        <div className="assignee-selector" ref={dropdownRef}>
          <span
            className={`assignee-badge todo-assignee ${!assignee ? 'unassigned' : ''} ${onUpdate ? 'clickable' : ''}`}
            title={onUpdate ? 'Click to assign' : (assignee?.email || 'No assignee')}
            onClick={(e) => {
              if (onUpdate) {
                e.stopPropagation();
                setShowAssigneeDropdown(!showAssigneeDropdown);
              }
            }}
          >
            {assignee ? (assignee.name || assignee.email || 'Assigned') : 'Unassigned'}
          </span>
          {showAssigneeDropdown && (
            <div className="assignee-dropdown">
              <div
                className={`assignee-option ${!assignee ? 'selected' : ''}`}
                onClick={() => handleAssigneeChange(null)}
              >
                Unassigned
              </div>
              {users.map(user => (
                <div
                  key={user.id}
                  className={`assignee-option ${assignee?.id === user.id ? 'selected' : ''}`}
                  onClick={() => handleAssigneeChange(user)}
                >
                  {user.name || user.email || user.id}
                </div>
              ))}
            </div>
          )}
        </div>
        {onUpdate && (
          <button
            className="todo-edit-btn"
            onClick={() => setIsEditing(true)}
            title="Edit to-do"
          >
            ✎
          </button>
        )}
        <button className="todo-delete" onClick={onDelete} title="Delete to-do">
          ×
        </button>
      </div>

      {!todo.completed && (
        <>
          <p className="todo-description">{todo.description}</p>
          {todo.steps.length > 0 && (
            <ul className="todo-steps">
              {todo.steps.map((step, index) => (
                <li key={index} className="todo-step">
                  {step}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
