import { useState, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './App.css'

// Sortable Clip Item in Timeline
function SortableClip({ id, file, onRemove }: { id: string, file: File, onRemove: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="clip-item" {...attributes} {...listeners}>
      <div className="clip-name">{file.name}</div>
      <button className="clip-remove" onClick={(e) => {
        e.stopPropagation();
        onRemove(id);
      }}>✕</button>
    </div>
  );
}

function App() {
  const [files, setFiles] = useState<{id: string, file: File}[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  
  const [srtContent, setSrtContent] = useState<string | null>(null)
  const [srtDownloadUrl, setSrtDownloadUrl] = useState<string | null>(null)
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelection(Array.from(e.dataTransfer.files))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelection(Array.from(e.target.files))
    }
    // Reset input so the same file can be uploaded again if removed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFilesSelection = (newFiles: File[]) => {
    const validFiles = newFiles.filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|flac|ogg)$/i))
    if (validFiles.length > 0) {
      const fileObjects = validFiles.map(f => ({
        id: Math.random().toString(36).substring(7),
        file: f
      }));
      setFiles(prev => [...prev, ...fileObjects])
    }
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  const handleTranscribe = async () => {
    if (files.length === 0) return
    setIsTranscribing(true)
    try {
      const formData = new FormData()
      files.forEach(fObj => formData.append('files', fObj.file))

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Transcription failed')

      const data = await response.json()
      setSrtContent(data.srtContent)
      setMergedAudioUrl(data.audioUrl)
      
      const srtBlob = new Blob([data.srtContent], { type: 'text/plain' })
      setSrtDownloadUrl(window.URL.createObjectURL(srtBlob))
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'An error occurred')
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleCopy = async () => {
    if (srtContent) {
      await navigator.clipboard.writeText(srtContent)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }
  }

  const totalSize = files.reduce((acc, curr) => acc + curr.file.size, 0)
  const formattedSize = (totalSize / (1024 * 1024)).toFixed(2)

  return (
    <div className="editor-layout">
      {/* NAVBAR */}
      <div className="navbar">
        <div className="brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
          </svg>
          NeuralScribe Editor
        </div>
        <div className="nav-actions">
          {mergedAudioUrl && (
            <a href={mergedAudioUrl} download="merged_audio.mp3" className="btn-secondary" style={{textDecoration: 'none'}}>
              Export Audio
            </a>
          )}
          <button 
            className="btn-primary" 
            onClick={handleTranscribe} 
            disabled={files.length === 0 || isTranscribing}
          >
            {isTranscribing ? 'Processing...' : 'Export & Transcribe'}
          </button>
        </div>
      </div>

      {/* WORKSPACE */}
      <div className="workspace">
        {/* Media Pool */}
        <div className="panel media-pool">
          <div className="panel-header">Media Pool</div>
          <div className="panel-content">
            <div 
              className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div>Import Media</div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="audio/*" 
              multiple
              style={{ display: 'none' }} 
            />
            
            <div className="asset-list">
              {files.map(f => (
                <div key={`asset-${f.id}`} className="asset-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                  </svg>
                  <span className="asset-item-name">{f.file.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview Window */}
        <div className="preview-window">
          <div className="panel-header">Preview</div>
          <div className="preview-content">
            {isTranscribing ? (
              <div className="status-indicator">
                <div className="spinner"></div>
                <div style={{ color: 'var(--text-secondary)' }}>Processing audio & generating subtitles...</div>
              </div>
            ) : srtContent ? (
              <>
                {mergedAudioUrl && (
                  <div className="audio-player-container">
                    <audio controls src={mergedAudioUrl} style={{ width: '100%' }} />
                  </div>
                )}
                <div className="srt-preview">{srtContent}</div>
              </>
            ) : (
              <div className="audio-visualizer-placeholder"></div>
            )}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="panel properties-panel">
          <div className="panel-header">Inspector</div>
          <div className="panel-content">
            <div className="prop-group">
              <span className="prop-label">Total Clips</span>
              <span className="prop-value">{files.length}</span>
            </div>
            <div className="prop-group">
              <span className="prop-label">Total Size</span>
              <span className="prop-value">{formattedSize} MB</span>
            </div>
            {srtContent && (
              <div className="prop-group">
                <span className="prop-label">Subtitles</span>
                <button className="btn-secondary" onClick={handleCopy} style={{width: '100%', marginBottom: '0.5rem'}}>
                  {isCopied ? 'Copied!' : 'Copy SRT Text'}
                </button>
                {srtDownloadUrl && (
                  <a href={srtDownloadUrl} download="subtitles.srt" className="btn-secondary" style={{width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none'}}>
                    Download .SRT
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TIMELINE */}
      <div className="timeline-panel">
        <div className="timeline-toolbar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Sequence 1</span>
        </div>
        <div className="timeline-tracks-container">
          <div className="timeline-track">
            <div className="track-header">
              <span className="track-title">Audio 1</span>
            </div>
            <div className="track-content">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={files.map(f => f.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {files.map((fObj) => (
                    <SortableClip 
                      key={fObj.id} 
                      id={fObj.id} 
                      file={fObj.file} 
                      onRemove={removeFile}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
          {/* Empty Track Placeholder */}
          <div className="timeline-track">
            <div className="track-header">
              <span className="track-title">Audio 2</span>
            </div>
            <div className="track-content"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
