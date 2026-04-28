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

// Sortable item component
function SortableAudioItem({ id, file, onRemove }: { id: string, file: File, onRemove: (id: string) => void }) {
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
    <div ref={setNodeRef} style={style} className="timeline-item glass-panel">
      <div className="drag-handle" {...attributes} {...listeners}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="12" r="1"></circle>
          <circle cx="9" cy="5" r="1"></circle>
          <circle cx="9" cy="19" r="1"></circle>
          <circle cx="15" cy="12" r="1"></circle>
          <circle cx="15" cy="5" r="1"></circle>
          <circle cx="15" cy="19" r="1"></circle>
        </svg>
      </div>
      <div className="timeline-item-content">
        <div className="timeline-item-name" title={file.name}>{file.name}</div>
        <div className="timeline-item-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
      </div>
      <button className="remove-btn" onClick={() => onRemove(id)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
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
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
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
  }

  const handleFilesSelection = (newFiles: File[]) => {
    const validFiles = newFiles.filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|flac|ogg)$/i))
    
    if (validFiles.length !== newFiles.length) {
      setError("Some files were ignored because they are not valid audio files.")
    } else {
      setError(null)
    }

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
    setError(null)

    const formData = new FormData()
    files.forEach(fObj => {
      formData.append('files', fObj.file)
    })

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Transcription failed')
      }

      const data = await response.json()
      
      setSrtContent(data.srtContent)
      setMergedAudioUrl(data.audioUrl)
      
      const srtBlob = new Blob([data.srtContent], { type: 'text/plain' })
      const srtUrl = window.URL.createObjectURL(srtBlob)
      setSrtDownloadUrl(srtUrl)
      
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'An unexpected error occurred')
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

  const handleReset = () => {
    setFiles([])
    setSrtDownloadUrl(null)
    setSrtContent(null)
    setMergedAudioUrl(null)
    setIsCopied(false)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="app-container fade-in">
      <header className="header">
        <h1 className="animated-gradient-text">NeuralScribe</h1>
        <p>Offline AI Subtitle & Audio Merger</p>
      </header>

      <main>
        <div className="glass-panel upload-card">
          {!srtContent ? (
            <>
              <div 
                className={`upload-area ${isDragging ? 'drag-active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="upload-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <div className="upload-text">Drag & Drop Audio Files</div>
                <div className="upload-subtext">Merge multiple clips into one track (MP3, WAV)</div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" 
                multiple
                style={{ display: 'none' }} 
              />

              {files.length > 0 && (
                <div className="timeline-container fade-in">
                  <h3 className="timeline-title">Audio Timeline (Drag to reorder)</h3>
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="timeline-track">
                      <SortableContext 
                        items={files.map(f => f.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {files.map((fObj) => (
                          <SortableAudioItem 
                            key={fObj.id} 
                            id={fObj.id} 
                            file={fObj.file} 
                            onRemove={removeFile}
                          />
                        ))}
                      </SortableContext>
                    </div>
                  </DndContext>
                </div>
              )}

              {error && (
                <div style={{ color: 'var(--error-color)', marginTop: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', width: '100%' }}>
                  {error}
                </div>
              )}

              {isTranscribing ? (
                <div className="status-container fade-in">
                  <div className="progress-bar">
                    <div className="progress-fill indeterminate"></div>
                  </div>
                  <div className="status-text">
                    Merging audio and transcribing... this may take a moment.
                  </div>
                </div>
              ) : (
                <button 
                  className="btn" 
                  onClick={handleTranscribe} 
                  disabled={files.length === 0}
                >
                  {files.length > 1 ? `Merge & Transcribe (${files.length} files)` : 'Generate Subtitles'}
                </button>
              )}
            </>
          ) : (
            <div className="success-container fade-in">
              <div className="success-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <h2 style={{ marginBottom: '1rem' }}>Processing Complete!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {files.length > 1 ? "Your files were merged and transcribed." : "Your subtitles have been generated."}
              </p>
              
              {mergedAudioUrl && (
                <div className="audio-player-container">
                  <audio controls src={mergedAudioUrl} style={{ width: '100%' }} />
                </div>
              )}
              
              <div className="srt-preview" style={{ marginTop: '1rem' }}>
                {srtContent}
              </div>
              
              <div className="action-buttons">
                <button 
                  className="btn copy-btn" 
                  onClick={handleCopy}
                >
                  {isCopied ? 'Copied!' : 'Copy SRT'}
                </button>
                {srtDownloadUrl && (
                  <a 
                    href={srtDownloadUrl} 
                    download="subtitles.srt"
                    className="btn"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    Download .SRT
                  </a>
                )}
                {mergedAudioUrl && (
                  <a 
                    href={mergedAudioUrl} 
                    download="merged_audio.mp3"
                    className="btn copy-btn"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    Download MP3
                  </a>
                )}
              </div>
              
              <button className="btn reset-btn" onClick={handleReset} style={{ width: '100%' }}>
                Start Over
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
