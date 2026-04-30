import type { MediaType } from '../../types';

export const getMediaDuration = (file: File, type: MediaType): Promise<number> => {
  return new Promise((resolve) => {
    if (type === 'visual' && file.type.startsWith('image/')) {
      resolve(10); // default image duration
      return;
    }

    const url = URL.createObjectURL(file);
    const media = type === 'audio' ? new Audio(url) : document.createElement('video');
    
    media.onloadedmetadata = () => {
      let duration = media.duration;
      if (isNaN(duration) || !isFinite(duration)) {
        duration = 5;
      }
      resolve(duration);
      URL.revokeObjectURL(url);
    };
    
    media.onerror = () => {
      resolve(type === 'audio' ? 0 : 5); // fallback
      URL.revokeObjectURL(url);
    };

    media.src = url;
  });
};

export const generateThumbnail = (file: File, mediaKind: 'audio' | 'video' | 'image'): Promise<string | undefined> => {
  return new Promise((resolve) => {
    if (mediaKind === 'audio') {
      resolve(undefined);
      return;
    }

    if (mediaKind === 'image') {
      resolve(URL.createObjectURL(file));
      return;
    }

    if (mediaKind === 'video') {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.muted = true;
      video.src = url;

      video.onloadeddata = () => {
        let duration = video.duration;
        if (isNaN(duration) || !isFinite(duration)) {
          duration = 5;
        }
        video.currentTime = Math.min(1.0, duration / 2); // grab a frame 1s in
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        } else {
          resolve(undefined);
        }
        URL.revokeObjectURL(url);
      };

      video.onerror = () => {
        resolve(undefined);
        URL.revokeObjectURL(url);
      };
    }
  });
};

export const generateWaveform = async (file: File, samples: number = 200): Promise<number[]> => {
  let audioContext: AudioContext | undefined;
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const requestedSamples = Math.max(1, Math.round(samples));
    const blockSize = Math.max(1, Math.ceil(audioBuffer.length / requestedSamples));
    const waveform: number[] = [];

    for (let i = 0; i < requestedSamples; i++) {
      const start = i * blockSize;
      if (start >= audioBuffer.length) break;
      const end = Math.min(audioBuffer.length, start + blockSize);
      let peak = 0;

      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let j = start; j < end; j++) {
          peak = Math.max(peak, Math.abs(channelData[j] ?? 0));
        }
      }
      waveform.push(peak);
    }

    const maxAmplitude = Math.max(...waveform);
    return waveform.map(amp => maxAmplitude > 0 ? amp / maxAmplitude : 0);
  } catch (error) {
    console.error("Waveform generation failed:", error);
    return [];
  } finally {
    await audioContext?.close().catch(() => undefined);
  }
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
};

const encodeWav = (channels: Float32Array[], sampleRate: number): Blob => {
  const channelCount = Math.max(1, channels.length);
  const frameCount = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel]?.[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

export const extractAudioSegment = async (
  file: File,
  startSeconds: number,
  durationSeconds: number,
): Promise<File> => {
  let audioContext: AudioContext | undefined;
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const safeStart = Math.max(0, Math.min(audioBuffer.duration, startSeconds || 0));
    const safeEnd = Math.max(
      safeStart,
      Math.min(audioBuffer.duration, safeStart + Math.max(0, durationSeconds || 0)),
    );
    const startFrame = Math.floor(safeStart * audioBuffer.sampleRate);
    const endFrame = Math.min(audioBuffer.length, Math.ceil(safeEnd * audioBuffer.sampleRate));
    const frameCount = Math.max(0, endFrame - startFrame);
    if (frameCount <= 0) {
      throw new Error('Selected audio range is empty.');
    }

    const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, channel) =>
      audioBuffer.getChannelData(channel).slice(startFrame, endFrame)
    );
    const blob = encodeWav(channels, audioBuffer.sampleRate);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'audio';
    const startMs = Math.round(safeStart * 1000);
    const endMs = Math.round(safeEnd * 1000);
    return new File([blob], `${baseName}-${startMs}-${endMs}.wav`, { type: 'audio/wav' });
  } finally {
    await audioContext?.close().catch(() => undefined);
  }
};

export const generateFilmstrip = (file: File, duration: number, framesCount: number = 10): Promise<string[]> => {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    
    const frames: string[] = [];
    const interval = duration / framesCount;
    let currentFrame = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.onloadeddata = () => {
      canvas.width = 160; // low res for filmstrip performance
      canvas.height = 90;
      video.currentTime = 0.1; // start slightly in
    };

    video.onseeked = () => {
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.5));
      }
      
      currentFrame++;
      if (currentFrame < framesCount) {
        // seek to next frame
        video.currentTime = Math.min(duration, currentFrame * interval);
      } else {
        // Done
        resolve(frames);
        URL.revokeObjectURL(url);
      }
    };

    video.onerror = () => {
      resolve(frames);
      URL.revokeObjectURL(url);
    };
  });
};
