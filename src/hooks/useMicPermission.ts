import { useState, useEffect } from 'react';

export type MicPermissionState = 'unknown' | 'granted' | 'denied' | 'prompt';

/**
 * Tracks microphone permission state and provides a requestMic helper.
 * On iOS, getUserMedia must be triggered from a direct user gesture.
 */
export function useMicPermission() {
  const [micState, setMicState] = useState<MicPermissionState>('unknown');

  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((result) => {
        setMicState(result.state as MicPermissionState);
        result.onchange = () => setMicState(result.state as MicPermissionState);
      })
      .catch(() => setMicState('unknown'));
  }, []);

  const requestMic = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      setMicState('granted');
      return true;
    } catch {
      setMicState('denied');
      return false;
    }
  };

  return { micState, requestMic };
}
