import React from 'react';
import type { Assignee } from '../types';

interface AssigneeFilterProps {
  assignees: Assignee[];
  selectedAssignee: string | null; // null = all, 'unassigned' = unassigned, or assignee id
  onFilterChange: (assigneeId: string | null) => void;
}

export function AssigneeFilter({ assignees, selectedAssignee, onFilterChange }: AssigneeFilterProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'all') {
      onFilterChange(null);
    } else {
      onFilterChange(value);
    }
  };

  return (
    <div className="assignee-filter">
      <select
        value={selectedAssignee || 'all'}
        onChange={handleChange}
        className="assignee-select"
      >
        <option value="all">All assignees</option>
        <option value="unassigned">Unassigned</option>
        {assignees.map((assignee) => (
          <option key={assignee.id} value={assignee.id}>
            {assignee.name || assignee.email || assignee.id}
          </option>
        ))}
      </select>
    </div>
  );
}
