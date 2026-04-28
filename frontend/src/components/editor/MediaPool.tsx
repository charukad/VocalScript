import { useRef, useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useEditorStore } from '../../store/editorStore';
import type { MediaAsset } from '../../types';

interface DraggableAssetProps {
  asset: MediaAsset;
  viewMode: 'list' | 'grid';
}

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
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18V5l12-2v13"></path>
        <circle cx="6" cy="18" r="3"></circle>
        <circle cx="18" cy="16" r="3"></circle>
      </svg>
    );
  };

  if (viewMode === 'grid') {
    return (
      <div ref={setNodeRef} style={style} className="asset-item-grid" {...attributes} {...listeners}>
        <div className="asset-thumbnail">
          {asset.thumbnailUrl ? (
            <img src={asset.thumbnailUrl} alt={asset.file.name} draggable="false" />
          ) : (
            <div className="asset-thumbnail-fallback">{getIcon()}</div>
          )}
          <div className="asset-type-badge">{getIcon()}</div>
        </div>
        <div className="asset-grid-info">
          <span className="asset-grid-name" title={asset.file.name}>{asset.file.name}</span>
        </div>
        <div className="asset-grid-overlay">
          <button className="btn-icon" title="Add to Timeline" onPointerDown={(e) => { e.stopPropagation(); addAssetToTimeline(asset); }}>
            +
          </button>
          <button className="btn-icon error" title="Delete from Pool" onPointerDown={(e) => { e.stopPropagation(); removeAsset(asset.id); }}>
            ✕
          </button>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div ref={setNodeRef} style={style} className="asset-item" {...attributes} {...listeners}>
      <div className="asset-list-icon">{getIcon()}</div>
      <span className="asset-item-name" title={asset.file.name}>{asset.file.name}</span>
      <button className="btn-icon" title="Add to Timeline" onPointerDown={(e) => { e.stopPropagation(); addAssetToTimeline(asset); }} style={{ padding: '2px', marginLeft: 'auto' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button className="btn-icon" title="Delete from Pool" onPointerDown={(e) => { e.stopPropagation(); removeAsset(asset.id); }} style={{ padding: '2px', color: 'var(--error-color)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

  return (
    <div className="panel media-pool">
      <div className="panel-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: 'auto', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Media Pool</span>
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            <button className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List View">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
            <button className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid View">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" 
            placeholder="Search media..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '0.2rem 0.5rem', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.8rem' }}
          />
          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value as any)}
            style={{ padding: '0.2rem', background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.8rem' }}
          >
            <option value="all">All</option>
            <option value="video">Videos</option>
            <option value="image">Images</option>
            <option value="audio">Audio</option>
          </select>
        </div>
      </div>
      <div className="panel-content">
        <div 
          className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ marginBottom: '1rem' }}
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
        
        <div className={`asset-list ${viewMode}`}>
          {filteredAssets.map(asset => (
            <DraggableAsset key={`asset-${asset.id}`} asset={asset} viewMode={viewMode} />
          ))}
          {assets.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem', gridColumn: '1 / -1' }}>
              Pool is empty. Upload files above.
            </div>
          )}
          {assets.length > 0 && filteredAssets.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem', gridColumn: '1 / -1' }}>
              No files match your search filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
