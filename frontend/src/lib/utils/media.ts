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
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const channelData = audioBuffer.getChannelData(0); // Use first channel
    const blockSize = Math.floor(channelData.length / samples);
    const waveform: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = i * blockSize;
      let min = 1.0;
      let max = -1.0;
      
      for (let j = 0; j < blockSize; j++) {
        const datum = channelData[start + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      // Calculate amplitude
      waveform.push(Math.max(Math.abs(min), Math.abs(max)));
    }
    
    // Normalize to 0-1
    const maxAmplitude = Math.max(...waveform);
    return waveform.map(amp => maxAmplitude > 0 ? amp / maxAmplitude : 0);
  } catch (error) {
    console.error("Waveform generation failed:", error);
    return [];
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
