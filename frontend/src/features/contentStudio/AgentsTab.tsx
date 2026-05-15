import { useEffect, useMemo, useState } from 'react';
import { getAgentWorkflow, listAgentRuns, startAgentWorkflow } from './api';
import { useContentStudioStore } from './contentStudioStore';
import type { AgentRun, WorkflowRunDetail } from './types';

type AgentsTabProps = {
  profileId: string;
};

const formatName = (value: string) => value.replaceAll('_', ' ');

export const AgentsTab = ({ profileId }: AgentsTabProps) => {
  const { loadProfileWorkspace } = useContentStudioStore();
  const [seedPrompt, setSeedPrompt] = useState('');
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowRunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupedRuns = useMemo(() => {
    const grouped = new Map<string, AgentRun[]>();
    for (const run of runs) {
      grouped.set(run.workflowRunId, [...(grouped.get(run.workflowRunId) ?? []), run]);
    }
    return [...grouped.entries()];
  }, [runs]);

  useEffect(() => {
    const loadRuns = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listAgentRuns(profileId);
        setRuns(response.runs);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load agent runs');
      } finally {
        setIsLoading(false);
      }
    };
    void loadRuns();
  }, [profileId]);

  const refreshRuns = async () => {
    const response = await listAgentRuns(profileId);
    setRuns(response.runs);
  };

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const workflow = await startAgentWorkflow({
        profileId,
        seedPrompt,
        createDrafts: true,
      });
      setSelectedWorkflow(workflow);
      await Promise.all([refreshRuns(), loadProfileWorkspace(profileId)]);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Could not start workflow');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSelectWorkflow = async (workflowId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      setSelectedWorkflow(await getAgentWorkflow(workflowId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load workflow');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="studio-agent-grid">
      <section className="studio-panel">
        <header>
          <h2>Start Workflow</h2>
        </header>
        <label>
          Seed Prompt
          <textarea
            rows={4}
            value={seedPrompt}
            onChange={event => setSeedPrompt(event.target.value)}
            placeholder="AI myths beginners still believe"
          />
        </label>
        <button className="btn-primary" onClick={() => void handleStart()} disabled={isStarting}>
          {isStarting ? 'Running...' : 'Run Draft Workflow'}
        </button>
        {error && <div className="content-profile-error">{error}</div>}
      </section>

      <section className="studio-panel studio-agent-history">
        <header>
          <h2>Agent Runs</h2>
          <span>{runs.length}</span>
        </header>
        {isLoading && <div className="studio-empty">Loading runs...</div>}
        {!isLoading && groupedRuns.length === 0 && <div className="studio-empty">No agent runs yet.</div>}
        {groupedRuns.map(([workflowId, workflowRuns]) => (
          <button
            key={workflowId}
            className={selectedWorkflow?.id === workflowId ? 'studio-workflow-row active' : 'studio-workflow-row'}
            onClick={() => void handleSelectWorkflow(workflowId)}
          >
            <strong>{workflowRuns[0]?.workflowRunId}</strong>
            <span>{workflowRuns.length} runs</span>
            <em>{workflowRuns.every(run => run.status === 'completed') ? 'completed' : workflowRuns[0]?.status}</em>
          </button>
        ))}
      </section>

      <section className="studio-panel studio-agent-detail">
        {!selectedWorkflow && <div className="studio-empty">Select a workflow to inspect its outputs.</div>}
        {selectedWorkflow && (
          <>
            <header>
              <h2>{formatName(selectedWorkflow.workflowType)}</h2>
              <span>{selectedWorkflow.status}</span>
            </header>
            <div className="studio-agent-summary">
              <span>{selectedWorkflow.outputJson.createdIdeaIds?.length ?? 0} idea drafts</span>
              <span>{selectedWorkflow.outputJson.createdScriptId ? '1 script draft' : '0 script drafts'}</span>
            </div>
            {selectedWorkflow.runs.map(run => (
              <article className="studio-agent-run-item" key={run.id}>
                <div>
                  <strong>{formatName(run.agentName)}</strong>
                  <span>{run.status}</span>
                </div>
                {run.errorMessage && <p>{run.errorMessage}</p>}
                {!run.errorMessage && (
                  <pre>{JSON.stringify(run.outputJson, null, 2)}</pre>
                )}
              </article>
            ))}
          </>
        )}
      </section>
    </div>
  );
};
