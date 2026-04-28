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
  const [audioFiles, setAudioFiles] = useState<{id: string, file: File}[]>([])
  const [visualFile, setVisualFile] = useState<File | null>(null)
  
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  
  const [srtContent, setSrtContent] = useState<string | null>(null)
  const [srtDownloadUrl, setSrtDownloadUrl] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFilesSelection = (newFiles: File[]) => {
    const newAudio = []
    let newVisual = null
    
    for (const f of newFiles) {
      if (f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|flac|ogg)$/i)) {
        newAudio.push({ id: Math.random().toString(36).substring(7), file: f })
      } else if (f.type.startsWith('video/') || f.type.startsWith('image/') || f.name.match(/\.(mp4|mov|jpg|jpeg|png)$/i)) {
        newVisual = f // Take the last visual file if multiple are uploaded
      }
    }
    
    if (newAudio.length > 0) {
      setAudioFiles(prev => [...prev, ...newAudio])
    }
    if (newVisual) {
      setVisualFile(newVisual)
    }
  }

  const removeAudioFile = (id: string) => {
    setAudioFiles(prev => prev.filter(f => f.id !== id))
  }
  
  const removeVisualFile = () => {
    setVisualFile(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setAudioFiles((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  const handleExport = async () => {
    if (audioFiles.length === 0) return
    setIsProcessing(true)
    try {
      const formData = new FormData()
      audioFiles.forEach(fObj => formData.append('files', fObj.file))
      if (visualFile) {
        formData.append('visual_file', visualFile)
      }

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Processing failed')

      const data = await response.json()
      setSrtContent(data.srtContent)
      setMediaUrl(data.mediaUrl)
      
      const srtBlob = new Blob([data.srtContent], { type: 'text/plain' })
      setSrtDownloadUrl(window.URL.createObjectURL(srtBlob))
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'An error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopy = async () => {
    if (srtContent) {
      await navigator.clipboard.writeText(srtContent)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }
  }

  const totalAudioSize = audioFiles.reduce((acc, curr) => acc + curr.file.size, 0)
  const visualSize = visualFile ? visualFile.size : 0
  const formattedSize = ((totalAudioSize + visualSize) / (1024 * 1024)).toFixed(2)

  return (
    <div className="editor-layout">
      {/* NAVBAR */}
      <div className="navbar">
        <div className="brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="2" y1="7" x2="7" y2="7"></line>
            <line x1="2" y1="17" x2="7" y2="17"></line>
            <line x1="17" y1="17" x2="22" y2="17"></line>
            <line x1="17" y1="7" x2="22" y2="7"></line>
          </svg>
          NeuralScribe Video Editor
        </div>
        <div className="nav-actions">
          {mediaUrl && (
            <a href={mediaUrl} download={visualFile ? "export.mp4" : "export.mp3"} className="btn-secondary" style={{textDecoration: 'none'}}>
              Download {visualFile ? "Video" : "Audio"}
            </a>
          )}
          <button 
            className="btn-primary" 
            onClick={handleExport} 
            disabled={audioFiles.length === 0 || isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Export & Transcribe'}
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
              <div>Import Audio/Video/Images</div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="audio/*,video/*,image/*" 
              multiple
              style={{ display: 'none' }} 
            />
            
            <div className="asset-list">
              {visualFile && (
                <div className="asset-item" style={{ borderColor: 'var(--accent-color)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <span className="asset-item-name">{visualFile.name}</span>
                </div>
              )}
              {audioFiles.map(f => (
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
            {isProcessing ? (
              <div className="status-indicator">
                <div className="spinner"></div>
                <div style={{ color: 'var(--text-secondary)' }}>Processing media & generating subtitles...</div>
              </div>
            ) : srtContent ? (
              <>
                {mediaUrl && (
                  <div className="audio-player-container" style={{ display: 'flex', justifyContent: 'center' }}>
                    {mediaUrl.endsWith('.mp4') ? (
                      <video controls src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }} />
                    ) : (
                      <audio controls src={mediaUrl} style={{ width: '100%' }} />
                    )}
                  </div>
                )}
                <div className="srt-preview">{srtContent}</div>
              </>
            ) : (
              <div className="audio-visualizer-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>No Media Exported</span>
              </div>
            )}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="panel properties-panel">
          <div className="panel-header">Inspector</div>
          <div className="panel-content">
            <div className="prop-group">
              <span className="prop-label">Visual Track</span>
              <span className="prop-value">{visualFile ? 'Active (Video/Image)' : 'None'}</span>
            </div>
            <div className="prop-group">
              <span className="prop-label">Audio Tracks</span>
              <span className="prop-value">{audioFiles.length} clips</span>
            </div>
            <div className="prop-group">
              <span className="prop-label">Total Size</span>
              <span className="prop-value">{formattedSize} MB</span>
            </div>
            {srtContent && (
              <div className="prop-group" style={{ marginTop: '2rem' }}>
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
          <span style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Main Sequence</span>
        </div>
        <div className="timeline-tracks-container">
          
          {/* Visual Track */}
          <div className="timeline-track" style={{ height: '60px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
            <div className="track-header" style={{ borderColor: 'transparent' }}>
              <span className="track-title" style={{ color: 'var(--text-highlight)' }}>Visual (V1)</span>
            </div>
            <div className="track-content" style={{ padding: '0 10px' }}>
              {visualFile ? (
                <div className="clip-item" style={{ width: '100%', backgroundColor: '#6236FF', borderColor: '#4827c1' }}>
                  <div className="clip-name">{visualFile.name}</div>
                  <button className="clip-remove" onClick={removeVisualFile}>✕</button>
                </div>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Drag an image or video to Media Pool to set Visual Track</span>
              )}
            </div>
          </div>

          {/* Audio Track */}
          <div className="timeline-track">
            <div className="track-header">
              <span className="track-title" style={{ color: 'var(--accent-color)' }}>Audio (A1)</span>
            </div>
            <div className="track-content">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={audioFiles.map(f => f.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {audioFiles.map((fObj) => (
                    <SortableClip 
                      key={fObj.id} 
                      id={fObj.id} 
                      file={fObj.file} 
                      onRemove={removeAudioFile}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
