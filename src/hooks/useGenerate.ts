import { useCallback, useRef } from 'react';
import { useStore } from '../stores/useStore';
import { kieRequest, pollResult, saveTrack } from '../lib/api';
import type { Track } from '../types';

interface GenParams {
  prompt: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  model?: string;
}

export function useGenerate() {
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (params: GenParams): Promise<Track | null> => {
    const { user, isGuest, setGenerating, setGenProgress, setGenTaskId, addTrack, addToast } = useStore.getState();

    if (!user && !isGuest()) {
      useStore.getState().setLoginSheetOpen(true);
      throw new Error('로그인이 필요합니다');
    }

    const model = params.model || 'V4';
    const isLyria = model.startsWith('LYRIA');

    setGenerating(true);
    abortRef.current = new AbortController();

    try {
      let tracks: any[];

      if (isLyria) {
        // Lyria: synchronous via /api/lyria-generate
        const res = await fetch('/api/lyria-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: params.prompt, style: params.style || '',
            instrumental: params.instrumental || false, title: params.title || '',
            model: model === 'LYRIA_CLIP' ? 'clip' : 'pro',
            userName: user?.name || 'guest', userProvider: user?.provider || 'guest',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.tracks?.length) throw new Error(data.error || '생성 실패');
        tracks = data.tracks;
      } else {
        // KIE: async with polling
        const body: Record<string, unknown> = {
          prompt: params.prompt,
          style: params.style || params.prompt,
          customMode: true,
          instrumental: params.instrumental || false,
          model,
          callBackUrl: 'https://ddinggok.com/api/callback',
        };
        if (params.title) body.title = params.title;

        const result = await kieRequest('POST', '/api/v1/generate', body,
          { name: user?.name || 'guest', provider: user?.provider || 'guest' });

        const taskId = result?.data?.taskId;
        if (!taskId) throw new Error('생성 요청 실패');
        setGenTaskId(taskId);

        tracks = await pollResult(taskId, (pct, status, eta) => {
          setGenProgress(pct, status, eta);
        }, abortRef.current.signal);
      }

      if (!tracks?.length) throw new Error('트랙 생성 실패');

      const track: Track = {
        id: tracks[0].id || Date.now().toString(),
        taskId: tracks[0].taskId || '',
        title: tracks[0].title || params.title || '무제',
        audio_url: tracks[0].audioUrl || tracks[0].audio_url || '',
        image_url: tracks[0].imageUrl || tracks[0].image_url || '',
        tags: tracks[0].tags || params.style || '',
        lyrics: tracks[0].lyric || tracks[0].lyrics || params.prompt || '',
        duration: tracks[0].duration || 0,
        created: Date.now(),
        genMode: 'custom',
        model,
        _owner: user ? { name: user.name, avatar: user.avatar, provider: user.provider } : undefined,
      };

      addTrack(track);

      // Save to server
      saveTrack({
        id: track.id, taskId: track.taskId, title: track.title,
        audio_url: track.audio_url, image_url: track.image_url,
        tags: track.tags, lyrics: track.lyrics, genMode: track.genMode, model: track.model,
        owner_name: user?.name || 'guest', owner_avatar: user?.avatar || '', owner_provider: user?.provider || 'guest',
      }).catch(() => {});

      addToast('🎵 음악이 완성되었어요!', 'ok');
      return track;
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    useStore.getState().cancelGen();
    useStore.getState().setGenerating(false);
  }, []);

  return { generate, cancel };
}
