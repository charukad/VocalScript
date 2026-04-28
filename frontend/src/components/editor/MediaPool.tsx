import { useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';

export const MediaPool = () => {
  const { assets, addAssets, addAssetToTimeline, removeAsset } = useEditorStore();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addAssets(Array.from(e.dataTransfer.files));
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addAssets(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
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
          <div>Import Media (Images/Video/Audio)</div>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          multiple
          style={{ display: 'none' }} 
        />
        
        <div className="asset-list">
          {assets.map(asset => (
            <div key={`asset-${asset.id}`} className="asset-item" style={{ borderColor: asset.type === 'visual' ? 'var(--accent-color)' : 'transparent' }}>
              {asset.type === 'visual' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18V5l12-2v13"></path>
                  <circle cx="6" cy="18" r="3"></circle>
                  <circle cx="18" cy="16" r="3"></circle>
                </svg>
              )}
              <span className="asset-item-name" title={asset.file.name}>{asset.file.name}</span>
              <button className="btn-icon" title="Add to Timeline" onClick={() => addAssetToTimeline(asset)} style={{ padding: '2px', marginLeft: 'auto' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <button className="btn-icon" title="Delete from Pool" onClick={() => removeAsset(asset.id)} style={{ padding: '2px', color: 'var(--error-color)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          ))}
          {assets.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem' }}>
              Pool is empty. Upload files above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
