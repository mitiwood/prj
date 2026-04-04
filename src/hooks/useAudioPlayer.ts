import { useRef, useEffect, useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { playTrack } from '../lib/api';
import type { Track } from '../types';

let globalAudio: HTMLAudioElement | null = null;

export function useAudioPlayer() {
  const { currentTrack, isPlaying, queue, repeat, setCurrentTrack, setIsPlaying,
    setProgress, setDuration, setQueue, nextTrack } = useStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Singleton audio element
  if (!globalAudio) globalAudio = new Audio();
  audioRef.current = globalAudio;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => useStore.getState().setProgress(audio.currentTime);
    const onDuration = () => useStore.getState().setDuration(audio.duration || 0);
    const onEnded = () => {
      const { repeat } = useStore.getState();
      if (repeat === 'one') { audio.currentTime = 0; audio.play(); }
      else { useStore.getState().nextTrack(); }
    };
    const onPlay = () => useStore.getState().setIsPlaying(true);
    const onPause = () => useStore.getState().setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  // When currentTrack changes, load new source
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.audio_url) return;

    if (audio.src !== currentTrack.audio_url) {
      audio.src = currentTrack.audio_url;
      audio.load();
    }
    audio.play().catch(() => {});
    playTrack(currentTrack.id).catch(() => {});
  }, [currentTrack?.id]);

  const play = useCallback((track: Track, trackList?: Track[]) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    if (trackList) setQueue(trackList);
    else if (!queue.find((t) => t.id === track.id)) {
      setQueue([...queue, track]);
    }
  }, [queue, setCurrentTrack, setIsPlaying, setQueue]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, [setIsPlaying]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else audioRef.current?.play().catch(() => {});
  }, [isPlaying, pause]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  return { play, pause, togglePlay, seek, audioRef, currentTrack, isPlaying };
}
