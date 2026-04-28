import { useRef, useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useEditorStore } from '../../store/editorStore';
import type { MediaAsset } from '../../types';

interface DraggableAssetProps {
  asset: MediaAsset;
  viewMode: 'list' | 'grid';
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const DraggableAsset = ({ asset, viewMode }: DraggableAssetProps) => {
  const { addAssetToTimeline, removeAsset } = useEditorStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: asset.id,
    data: { type: 'pool-asset', assetType: asset.type }
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab'
  };

  const getIcon = () => {
    if (asset.mediaKind === 'video') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
          <line x1="7" y1="2" x2="7" y2="22"></line>
          <line x1="17" y1="2" x2="17" y2="22"></line>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <line x1="2" y1="7" x2="7" y2="7"></line>
          <line x1="2" y1="17" x2="7" y2="17"></line>
          <line x1="17" y1="17" x2="22" y2="17"></line>
          <line x1="17" y1="7" x2="22" y2="7"></line>
        </svg>
      );
    }
    if (asset.mediaKind === 'image') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      );
    }
    // Audio waveform icon
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18M8 8v8M4 11v2M16 6v12M20 9v6"></path>
      </svg>
    );
  };

  const getLargeIcon = () => {
    if (asset.mediaKind === 'audio') {
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent-color)' }}>
          <path d="M12 3v18M8 8v8M4 11v2M16 6v12M20 9v6"></path>
        </svg>
      );
    }
    return null;
  };

  if (viewMode === 'grid') {
    return (
      <div ref={setNodeRef} style={style} className="asset-item-grid" {...attributes} {...listeners}>
        <div className="asset-thumbnail">
          {asset.thumbnailUrl ? (
            <img src={asset.thumbnailUrl} alt={asset.file.name} draggable="false" />
          ) : (
            <div className="asset-thumbnail-fallback">{getLargeIcon() || getIcon()}</div>
          )}
          <div className="asset-type-badge">{getIcon()}</div>
        </div>
        <div className="asset-grid-info">
          <span className="asset-grid-name" title={asset.file.name}>{asset.file.name}</span>
          <span className="asset-grid-size">{formatFileSize(asset.file.size)}</span>
        </div>
        <div className="asset-grid-overlay">
          <button className="btn-icon" title="Add to Timeline" onPointerDown={(e) => { e.stopPropagation(); addAssetToTimeline(asset); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button className="btn-icon error" title="Delete from Pool" onPointerDown={(e) => { e.stopPropagation(); removeAsset(asset.id); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div ref={setNodeRef} style={style} className="asset-item" {...attributes} {...listeners}>
      <div className="asset-list-icon">{getIcon()}</div>
      <div className="asset-item-info">
        <span className="asset-item-name" title={asset.file.name}>{asset.file.name}</span>
        <span className="asset-item-meta">{asset.mediaKind} · {formatFileSize(asset.file.size)}</span>
      </div>
      <button className="btn-icon" title="Add to Timeline" onPointerDown={(e) => { e.stopPropagation(); addAssetToTimeline(asset); }} style={{ padding: '2px', marginLeft: 'auto' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button className="btn-icon" title="Delete from Pool" onPointerDown={(e) => { e.stopPropagation(); removeAsset(asset.id); }} style={{ padding: '2px', color: 'var(--error-color)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
};

export const MediaPool = () => {
  const { assets, addAssets } = useEditorStore();
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'image' | 'audio'>('all');
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

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchesSearch = asset.file.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || asset.mediaKind === filterType;
      return matchesSearch && matchesType;
    });
  }, [assets, searchQuery, filterType]);

  const counts = useMemo(() => ({
    all: assets.length,
    video: assets.filter(a => a.mediaKind === 'video').length,
    image: assets.filter(a => a.mediaKind === 'image').length,
    audio: assets.filter(a => a.mediaKind === 'audio').length,
  }), [assets]);

  return (
    <div className="panel media-pool">
      <div className="panel-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: 'auto', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Media Pool</span>
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            <button className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List View">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
            <button className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid View">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <div className="search-input-wrapper">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value as 'all' | 'video' | 'image' | 'audio')}
            className="filter-select"
          >
            <option value="all">All ({counts.all})</option>
            <option value="video">Video ({counts.video})</option>
            <option value="image">Image ({counts.image})</option>
            <option value="audio">Audio ({counts.audio})</option>
          </select>
        </div>
      </div>
      <div className="panel-content">
        {/* Compact upload zone */}
        <div 
          className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <span>Import Media</span>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          multiple
          style={{ display: 'none' }} 
        />
        
        <div className={`asset-list ${viewMode}`}>
          {filteredAssets.map(asset => (
            <DraggableAsset key={`asset-${asset.id}`} asset={asset} viewMode={viewMode} />
          ))}
          {assets.length === 0 && (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                <line x1="7" y1="2" x2="7" y2="22"></line>
                <line x1="17" y1="2" x2="17" y2="22"></line>
                <line x1="2" y1="12" x2="22" y2="12"></line>
              </svg>
              Drop files here or click Import
            </div>
          )}
          {assets.length > 0 && filteredAssets.length === 0 && (
            <div className="empty-state">No results found</div>
          )}
        </div>
      </div>
    </div>
  );
};
