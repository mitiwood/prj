import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../stores/useStore';
import type { Track } from '../types';
import { playTrack } from '../lib/api';

let _audio: HTMLAudioElement | null = null;
function getAudio(): HTMLAudioElement {
  if (!_audio) _audio = new Audio();
  return _audio;
}

export function useAudioPlayer() {
  const {
    currentTrack,
    queue,
    isPlaying,
    repeat,
    setCurrentTrack,
    setQueue,
    setIsPlaying,
    setProgress,
    setDuration,
    nextTrack,
    prevTrack,
  } = useStore();
  const audioRef = useRef(getAudio());

  useEffect(() => {
    const audio = audioRef.current;
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        nextTrack();
      }
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [repeat, nextTrack, setProgress, setDuration, setIsPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (currentTrack) {
      if (audio.src !== currentTrack.audio_url) {
        audio.src = currentTrack.audio_url;
        audio.play().catch(() => {});
        playTrack(currentTrack.id).catch(() => {});
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack._owner?.name ?? '띵곡',
          artwork: currentTrack.image_url
            ? [{ src: currentTrack.image_url }]
            : [],
        });
        navigator.mediaSession.setActionHandler('play', () => audio.play());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
        navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
      }
    }
  }, [currentTrack, nextTrack, prevTrack]);

  const play = useCallback(
    (track: Track, trackList?: Track[]) => {
      setCurrentTrack(track);
      if (trackList) setQueue(trackList);
    },
    [setCurrentTrack, setQueue],
  );

  const pause = useCallback(() => {
    audioRef.current.pause();
  }, []);

  const togglePlay = useCallback(() => {
    if (audioRef.current.paused) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, []);

  const seek = useCallback((time: number) => {
    audioRef.current.currentTime = time;
  }, []);

  return { play, pause, togglePlay, seek, isPlaying, currentTrack, queue };
}
