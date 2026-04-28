import type { MediaType } from '../../types';

export const getMediaDuration = (file: File, type: MediaType): Promise<number> => {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = type === 'audio' ? new Audio(url) : document.createElement('video');
    media.src = url;
    
    media.onloadedmetadata = () => {
      resolve(media.duration);
      URL.revokeObjectURL(url);
    };
    
    media.onerror = () => {
      resolve(5); // fallback duration
      URL.revokeObjectURL(url);
    };
  });
};
