import React from 'react';
import { useEditorStore } from '../../store/editorStore';

export const ProjectGate = () => {
  const {
    projectName,
    projectDirectory,
    availableProjects,
    projectStatus,
    isSavingProject,
    isLoadingProjects,
    setProjectName,
    setProjectDirectory,
    chooseProjectFolder,
    createProject,
    refreshProjects,
    loadProject,
    loadProjectFromPath,
  } = useEditorStore();
  const [loadPath, setLoadPath] = React.useState('');

  React.useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  return (
    <div className="project-gate">
      <div className="project-gate-panel">
        <div className="project-gate-header">
          <div className="brand">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
              <line x1="7" y1="2" x2="7" y2="22"></line>
              <line x1="17" y1="2" x2="17" y2="22"></line>
              <line x1="2" y1="12" x2="22" y2="12"></line>
            </svg>
            NeuralScribe
          </div>
          <span>{projectStatus}</span>
        </div>

        <div className="project-gate-grid">
          <section className="project-gate-section">
            <h2>Create Project</h2>
            <label>
              Project Name
              <input
                value={projectName}
                onChange={event => setProjectName(event.target.value)}
                placeholder="Untitled Project"
              />
            </label>
            <label>
              Parent Directory
              <div className="project-directory-row">
                <input
                  value={projectDirectory}
                  onChange={event => setProjectDirectory(event.target.value)}
                  placeholder="/Users/you/Videos"
                />
                <button className="btn-secondary" onClick={() => void chooseProjectFolder()} disabled={isLoadingProjects}>
                  Choose
                </button>
              </div>
            </label>
            <button
              className="btn-primary project-gate-action"
              onClick={() => void createProject()}
              disabled={isSavingProject || !projectDirectory.trim()}
            >
              {isSavingProject ? 'Creating...' : 'Create Project'}
            </button>
          </section>

          <section className="project-gate-section">
            <div className="project-gate-section-title">
              <h2>Load Project</h2>
              <button className="btn-secondary" onClick={() => void refreshProjects()} disabled={isLoadingProjects}>
                Refresh
              </button>
            </div>
            <div className="project-load-path">
              <input
                value={loadPath}
                onChange={event => setLoadPath(event.target.value)}
                placeholder="/path/to/project.json or project folder"
              />
              <button className="btn-secondary" onClick={() => void loadProjectFromPath(loadPath)} disabled={isLoadingProjects}>
                Load Path
              </button>
            </div>
            <div className="previous-project-list">
              {availableProjects.length === 0 && (
                <div className="project-empty">No previous projects found.</div>
              )}
              {availableProjects.map(project => (
                <button
                  key={project.id}
                  className="project-row"
                  onClick={() => void loadProject(project.id)}
                  disabled={isLoadingProjects}
                >
                  <strong>{project.name}</strong>
                  <span>{project.folderPath}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
