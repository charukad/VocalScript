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
      resolve(media.duration);
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
        video.currentTime = Math.min(1.0, video.duration / 2); // grab a frame 1s in
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
