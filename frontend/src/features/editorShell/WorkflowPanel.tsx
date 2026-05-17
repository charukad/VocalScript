import { useMemo, useState } from 'react';
import { CheckCircle2, GitCompareArrows, MessageSquarePlus, RefreshCcw, Save, TriangleAlert } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';
import type { ProjectVersion } from '../../types';

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const versionMetricLines = (left: ProjectVersion | undefined, right: ProjectVersion | undefined): string[] => {
  if (!left || !right) return [];
  return [
    `Clips: ${left.summary.clipCount} -> ${right.summary.clipCount}`,
    `Assets: ${left.summary.assetCount} -> ${right.summary.assetCount}`,
    `Markers: ${left.summary.markerCount} -> ${right.summary.markerCount}`,
    `Comments: ${left.summary.commentCount} -> ${right.summary.commentCount}`,
    `Duration: ${formatTime(left.summary.durationSeconds)} -> ${formatTime(right.summary.durationSeconds)}`,
  ];
};

export const WorkflowPanel = () => {
  const {
    playheadTime,
    missingMedia,
    relinkMissingMedia,
    projectVersions,
    createProjectVersion,
    restoreProjectVersion,
    approvalState,
    setApprovalState,
    reviewComments,
    addReviewComment,
    updateReviewComment,
    removeReviewComment,
  } = useEditorStore();
  const [versionLabel, setVersionLabel] = useState('');
  const [commentText, setCommentText] = useState('');
  const [compareLeftId, setCompareLeftId] = useState(projectVersions[1]?.id ?? projectVersions[0]?.id ?? '');
  const [compareRightId, setCompareRightId] = useState(projectVersions[0]?.id ?? '');
  const effectiveCompareRightId = projectVersions.some(version => version.id === compareRightId)
    ? compareRightId
    : projectVersions[0]?.id ?? '';
  const effectiveCompareLeftId = projectVersions.some(version => version.id === compareLeftId)
    ? compareLeftId
    : projectVersions[1]?.id ?? projectVersions[0]?.id ?? '';
  const compareLeft = projectVersions.find(version => version.id === effectiveCompareLeftId);
  const compareRight = projectVersions.find(version => version.id === effectiveCompareRightId);
  const comparisonLines = useMemo(
    () => versionMetricLines(compareLeft, compareRight),
    [compareLeft, compareRight],
  );

  return (
    <section className="panel workspace-tool-panel workflow-panel">
      <div className="panel-header">Workflow</div>
      <div className="panel-content workflow-panel-content">
        <section className="workflow-section">
          <div className="workflow-section-title">
            <TriangleAlert size={15} />
            Recovery
          </div>
          {missingMedia.length === 0 && <p className="workflow-hint">No missing media detected.</p>}
          {missingMedia.map(record => (
            <label className="workflow-card file-card" key={record.assetId}>
              <strong>{record.fileName}</strong>
              <span>{record.clipCount} timeline clip{record.clipCount === 1 ? '' : 's'} waiting for relink</span>
              <input
                type="file"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void relinkMissingMedia(record.assetId, file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          ))}
        </section>

        <section className="workflow-section">
          <div className="workflow-section-title">
            <Save size={15} />
            Versions
          </div>
          <div className="workflow-inline">
            <input
              value={versionLabel}
              onChange={event => setVersionLabel(event.target.value)}
              placeholder="Version label"
            />
            <button
              className="btn-secondary"
              onClick={() => {
                createProjectVersion(versionLabel);
                setVersionLabel('');
              }}
            >
              Save
            </button>
          </div>
          {projectVersions.length === 0 && <p className="workflow-hint">Create a named restore point before larger edits.</p>}
          {projectVersions.map(version => (
            <div className="workflow-row" key={version.id}>
              <div className="workflow-card compact">
                <strong>{version.label}</strong>
                <span>{new Date(version.createdAt).toLocaleString()}</span>
              </div>
              <button className="btn-icon" title="Restore version" onClick={() => void restoreProjectVersion(version.id)}>
                <RefreshCcw size={14} />
              </button>
            </div>
          ))}
        </section>

        {projectVersions.length > 1 && (
          <section className="workflow-section">
            <div className="workflow-section-title">
              <GitCompareArrows size={15} />
              Compare
            </div>
            <div className="workflow-compare-grid">
              <select value={effectiveCompareLeftId} onChange={event => setCompareLeftId(event.target.value)}>
                {projectVersions.map(version => <option key={version.id} value={version.id}>{version.label}</option>)}
              </select>
              <select value={effectiveCompareRightId} onChange={event => setCompareRightId(event.target.value)}>
                {projectVersions.map(version => <option key={version.id} value={version.id}>{version.label}</option>)}
              </select>
            </div>
            {comparisonLines.map(line => <p className="workflow-hint" key={line}>{line}</p>)}
          </section>
        )}

        <section className="workflow-section">
          <div className="workflow-section-title">
            <CheckCircle2 size={15} />
            Approval
          </div>
          <div className="workflow-segmented">
            {(['draft', 'in_review', 'approved', 'changes_requested'] as const).map(state => (
              <button
                key={state}
                className={approvalState === state ? 'active' : ''}
                onClick={() => setApprovalState(state)}
              >
                {state.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </section>

        <section className="workflow-section">
          <div className="workflow-section-title">
            <MessageSquarePlus size={15} />
            Review Comments
          </div>
          <div className="workflow-inline stacked">
            <textarea
              value={commentText}
              onChange={event => setCommentText(event.target.value)}
              placeholder={`Add a note at ${formatTime(playheadTime)}`}
            />
            <button
              className="btn-secondary"
              onClick={() => {
                addReviewComment(playheadTime, commentText);
                setCommentText('');
              }}
            >
              Add at {formatTime(playheadTime)}
            </button>
          </div>
          {reviewComments.length === 0 && <p className="workflow-hint">No review comments yet.</p>}
          {reviewComments.map(comment => (
            <article className={`review-comment ${comment.status}`} key={comment.id}>
              <div>
                <strong>{formatTime(comment.time)}</strong>
                <span>{comment.author}</span>
              </div>
              <p>{comment.text}</p>
              <div className="review-comment-actions">
                <button
                  className="btn-secondary"
                  onClick={() => updateReviewComment(comment.id, { status: comment.status === 'open' ? 'resolved' : 'open' })}
                >
                  {comment.status === 'open' ? 'Resolve' : 'Reopen'}
                </button>
                <button className="btn-secondary danger" onClick={() => removeReviewComment(comment.id)}>Delete</button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </section>
  );
};
