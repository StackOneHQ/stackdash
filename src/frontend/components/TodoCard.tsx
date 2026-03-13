import React, { useState } from 'react';
import type { Todo } from '../types';

interface TodoCardProps {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate?: (updates: Partial<Todo>) => void;
}

export function TodoCard({ todo, onToggle, onDelete, onUpdate }: TodoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(todo.description);
  const [editSteps, setEditSteps] = useState<string[]>(todo.steps);

  const handleSave = () => {
    if (onUpdate && editTitle.trim()) {
      onUpdate({
        title: editTitle.trim(),
        description: editDescription.trim(),
        steps: editSteps.filter(s => s.trim() !== ''),
      });
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditTitle(todo.title);
    setEditDescription(todo.description);
    setEditSteps(todo.steps);
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

  return (
    <div className={`todo-card ${todo.completed ? 'completed' : ''}`}>
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
        {todo.assignee && (
          <span
            className="assignee-badge todo-assignee"
            title={todo.assignee.email || ''}
          >
            {todo.assignee.name || todo.assignee.email || 'Assigned'}
          </span>
        )}
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
