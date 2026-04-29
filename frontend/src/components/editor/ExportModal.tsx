import { useEditorStore } from '../../store/editorStore';

const RESOLUTIONS = [
  { value: '720p',  label: '720p HD',    w: 1280, h: 720  },
  { value: '1080p', label: '1080p FHD',  w: 1920, h: 1080 },
  { value: '4k',    label: '4K UHD',     w: 3840, h: 2160 },
] as const;

const ASPECT_RATIOS = [
  { value: '16:9', label: '16:9 — Landscape (YouTube, Desktop)',  icon: '▬' },
  { value: '9:16', label: '9:16 — Portrait (TikTok, Reels)',      icon: '▮' },
  { value: '1:1',  label: '1:1 — Square (Instagram)',             icon: '■' },
] as const;

const QUALITIES = [
  { value: 'high',       label: 'High Quality',  desc: 'Larger file, best image quality' },
  { value: 'standard',   label: 'Standard',       desc: 'Balanced size & quality (recommended)' },
  { value: 'compressed', label: 'Compressed',     desc: 'Smallest file, good for web sharing' },
] as const;

export const ExportModal = () => {
  const {
    closeExportModal, exportSettings, setExportSettings, exportSequence, isProcessing, clips
  } = useEditorStore();

  const res = RESOLUTIONS.find(r => r.value === exportSettings.resolution) ?? RESOLUTIONS[1];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
      onClick={closeExportModal}
    >
      <div
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '2rem', width: '480px', maxWidth: '95vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Export Video
          </h2>
          <button
            onClick={closeExportModal}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
          >✕</button>
        </div>

        {/* Resolution */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Resolution
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {RESOLUTIONS.map(r => (
              <button
                key={r.value}
                onClick={() => setExportSettings({ resolution: r.value })}
                style={{
                  flex: 1, padding: '0.6rem', borderRadius: '8px', cursor: 'pointer',
                  border: `2px solid ${exportSettings.resolution === r.value ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  background: exportSettings.resolution === r.value ? 'rgba(99,54,255,0.15)' : 'var(--surface-3)',
                  color: exportSettings.resolution === r.value ? 'var(--accent-color)' : 'var(--text-secondary)',
                  fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s'
                }}
              >
                {r.label}<br/>
                <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{r.w}×{r.h}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Aspect Ratio
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {ASPECT_RATIOS.map(ar => (
              <button
                key={ar.value}
                onClick={() => setExportSettings({ aspectRatio: ar.value })}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.65rem 0.85rem', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${exportSettings.aspectRatio === ar.value ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  background: exportSettings.aspectRatio === ar.value ? 'rgba(99,54,255,0.15)' : 'var(--surface-3)',
                  color: 'var(--text-primary)', fontSize: '0.8rem', transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{ar.icon}</span>
                <span style={{ color: exportSettings.aspectRatio === ar.value ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{ar.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quality */}
        <div style={{ marginBottom: '1.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quality
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {QUALITIES.map(q => (
              <button
                key={q.value}
                onClick={() => setExportSettings({ quality: q.value })}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem', borderRadius: '8px', cursor: 'pointer',
                  border: `2px solid ${exportSettings.quality === q.value ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  background: exportSettings.quality === q.value ? 'rgba(99,54,255,0.15)' : 'var(--surface-3)',
                  color: 'var(--text-primary)', fontSize: '0.8rem', transition: 'all 0.15s'
                }}
              >
                <span style={{ fontWeight: 600, color: exportSettings.quality === q.value ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                  {q.label}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{q.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Summary + Export */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Output: <strong style={{ color: 'var(--text-primary)' }}>{res.label}</strong> · {exportSettings.aspectRatio} · {exportSettings.quality} quality
            <br />
            {clips.length} clip{clips.length !== 1 ? 's' : ''} in sequence
          </div>
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}
            onClick={exportSequence}
            disabled={isProcessing || clips.length === 0}
          >
            {isProcessing ? 'Exporting...' : 'Export & Transcribe'}
          </button>
        </div>
      </div>
    </div>
  );
};
