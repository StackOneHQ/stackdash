import React, { useState } from 'react';
import type { TriagedIssue, Todo } from '../types';
import { generateTodo, deleteIssue } from '../hooks/useIssues';

interface IssueCardProps {
  issue: TriagedIssue;
  onTodoGenerated: (todo: Todo) => void;
  onDeleted: (issueId: string) => void;
}

export function IssueCard({ issue, onTodoGenerated, onDeleted }: IssueCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    const { success, error } = await deleteIssue(issue.id);
    setIsDeleting(false);

    if (success) {
      onDeleted(issue.id);
    } else {
      console.error('Failed to delete issue:', error);
    }
  };

  const handleCreateTodo = async () => {
    if (isGenerating || issue.status !== 'triaged') return;

    setIsGenerating(true);
    const { todo, error } = await generateTodo(issue.id);
    setIsGenerating(false);

    if (todo) {
      onTodoGenerated(todo);
    } else {
      console.error('Failed to generate todo:', error);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isPending = issue.status === 'pending' || issue.status === 'triaging';
  const pylonLink = issue.originalIssue.pylonLink;
  const issueNumber = issue.originalIssue.issueNumber;

  return (
    <div className={`issue-card ${isPending ? 'pending' : issue.priority}`}>
      <div className="issue-card-header">
        <span className="issue-title">
          {pylonLink ? (
            <a href={pylonLink} target="_blank" rel="noopener noreferrer">
              {issueNumber ? `#${issueNumber} ` : ''}{issue.originalIssue.title}
            </a>
          ) : (
            issue.originalIssue.title
          )}
        </span>
        <div className="issue-card-actions">
          {!isPending && (
            <span className={`priority-badge ${issue.priority}`}>
              {issue.priority}
            </span>
          )}
          {isPending && (
            <span className="priority-badge pending-badge">
              {issue.status === 'triaging' ? 'Analyzing...' : 'Pending'}
            </span>
          )}
          <button
            className="issue-delete-btn"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Remove issue"
          >
            {isDeleting ? '...' : '×'}
          </button>
        </div>
      </div>

      {issue.summary ? (
        <p className="issue-summary">{issue.summary}</p>
      ) : (
        <p className="issue-summary issue-summary-placeholder">
          {issue.originalIssue.description.slice(0, 100)}
          {issue.originalIssue.description.length > 100 ? '...' : ''}
        </p>
      )}

      <div className="issue-meta">
        <span className="issue-customer">
          {issue.originalIssue.accountName ||
           issue.originalIssue.customerName ||
           issue.originalIssue.customerEmail ||
           'Unknown'}
        </span>
        <div className="issue-meta-right">
          {issue.originalIssue.assignee && (
            <span className="assignee-badge" title={issue.originalIssue.assignee.email || ''}>
              {issue.originalIssue.assignee.name || issue.originalIssue.assignee.email || 'Assigned'}
            </span>
          )}
          {issue.originalIssue.customerTier && (
            <span className="customer-tier">{issue.originalIssue.customerTier}</span>
          )}
          {issue.originalIssue.source && (
            <span className="customer-tier">{issue.originalIssue.source}</span>
          )}
          <span className="issue-time">{formatTime(issue.originalIssue.createdAt)}</span>
        </div>
      </div>

      {issue.status === 'triaged' && (
        <div className="issue-actions">
          <button
            className="btn btn-primary"
            onClick={handleCreateTodo}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <span className="spinner spinner-sm" />
                Creating...
              </>
            ) : (
              '+ Create To-Do'
            )}
          </button>
          {pylonLink && (
            <a
              href={pylonLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              View in Pylon
            </a>
          )}
        </div>
      )}

      {issue.status === 'failed' && (
        <div className="issue-actions">
          <span className="issue-error">
            Triage failed: {issue.errorMessage}
          </span>
        </div>
      )}
    </div>
  );
}
