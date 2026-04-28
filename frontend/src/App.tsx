import { useState, useRef } from 'react'
import './App.css'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [srtContent, setSrtContent] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      handleFileSelection(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0])
    }
  }

  const handleFileSelection = (selectedFile: File) => {
    // Only accept audio files
    if (selectedFile.type.startsWith('audio/') || selectedFile.name.match(/\.(mp3|wav|m4a|flac|ogg)$/i)) {
      setFile(selectedFile)
      setError(null)
      setDownloadUrl(null)
    } else {
      setError("Please select a valid audio file (MP3, WAV, M4A, etc.)")
    }
  }

  const handleTranscribe = async () => {
    if (!file) return

    setIsTranscribing(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Transcription failed')
      }

      const text = await response.text()
      setSrtContent(text)
      
      const blob = new Blob([text], { type: 'text/plain' })
      const url = window.URL.createObjectURL(blob)
      setDownloadUrl(url)
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
    setFile(null)
    setDownloadUrl(null)
    setSrtContent(null)
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
        <p>Offline AI Subtitle Generation</p>
      </header>

      <main>
        <div className="glass-panel upload-card">
          {!downloadUrl ? (
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
                <div className="upload-text">Drag & Drop Audio File</div>
                <div className="upload-subtext">or click to browse (MP3, WAV, M4A)</div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" 
                  style={{ display: 'none' }} 
                />
              </div>

              {file && (
                <div className="file-info fade-in">
                  <div className="file-name">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                      <path d="M9 18V5l12-2v13"></path>
                      <circle cx="6" cy="18" r="3"></circle>
                      <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                    {file.name}
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
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
                    Transcribing with local AI model... this may take a moment.
                  </div>
                </div>
              ) : (
                <button 
                  className="btn" 
                  onClick={handleTranscribe} 
                  disabled={!file}
                >
                  Generate Subtitles
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
              <h2 style={{ marginBottom: '1rem' }}>Transcription Complete!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Your subtitles have been generated successfully.
              </p>
              
              <div className="srt-preview">
                {srtContent}
              </div>
              
              <div className="action-buttons">
                <button 
                  className="btn copy-btn" 
                  onClick={handleCopy}
                >
                  {isCopied ? 'Copied!' : 'Copy Text'}
                </button>
                <a 
                  href={downloadUrl} 
                  download={`${file?.name.split('.')[0] || 'subtitles'}.srt`}
                  className="btn"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  Download .SRT
                </a>
              </div>
              
              <button className="btn reset-btn" onClick={handleReset} style={{ width: '100%' }}>
                Transcribe Another File
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
