import { useCallback, useRef } from 'react';
import { useStore } from '../stores/useStore';
import {
  kieRequest,
  pollResult,
  saveTrack,
  checkCredit,
  fetchJson,
  API_BASE,
} from '../lib/api';
import type { Track } from '../types';

interface GenInput {
  prompt: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  model?: string;
  lyrics?: string;
}

export function useGenerate() {
  const store = useStore();
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (input: GenInput) => {
      const {
        user,
        guestMode,
        guestUsage,
        incGuestUsage,
        addTrack,
        addToast,
        setIsGenerating,
        setGenProgress,
        setGenStatus,
        setGenEta,
        setGenTaskId,
        setGenCancelled,
        genModel,
      } = store;

      if (!user && !guestMode) {
        store.setLoginSheetOpen(true);
        return null;
      }

      if (!user && guestUsage >= 5) {
        addToast('게스트 무료 생성 5곡을 모두 사용했습니다', 'error');
        store.setLoginSheetOpen(true);
        return null;
      }

      if (user) {
        const credit = await checkCredit('generate', user.name, user.provider);
        if (!credit.allowed) {
          addToast(credit.message ?? '크레딧이 부족합니다', 'error');
          return null;
        }
      }

      const model = input.model ?? genModel;
      const isLyria = model.startsWith('LYRIA');

      setIsGenerating(true);
      setGenProgress(0);
      setGenStatus('생성 준비 중...');
      setGenEta(0);
      setGenCancelled(false);

      abortRef.current = new AbortController();

      try {
        let track: Track;

        if (isLyria) {
          setGenStatus('Lyria 모델로 생성 중...');
          const res = await fetchJson<{
            audio_url?: string;
            title?: string;
            image_url?: string;
            tags?: string;
            duration?: number;
          }>(`${API_BASE}/lyria-generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: input.prompt,
              style: input.style,
              instrumental: input.instrumental,
              model: model === 'LYRIA_CLIP' ? 'clip' : 'pro',
              user: user
                ? { name: user.name, provider: user.provider }
                : undefined,
            }),
            signal: abortRef.current.signal,
          });

          track = {
            id:
              Date.now().toString(36) +
              Math.random().toString(36).slice(2),
            title: input.title || res.title || 'Lyria Track',
            audio_url: res.audio_url || '',
            image_url: res.image_url,
            tags: res.tags || input.style,
            created: Date.now(),
            type: 'audio',
            genMode: 'custom',
            model,
            duration: res.duration,
            _owner: user
              ? {
                  name: user.name,
                  avatar: user.avatar,
                  provider: user.provider,
                }
              : undefined,
          };
        } else {
          setGenStatus('KIE 모델로 생성 중...');
          const genRes = await kieRequest(
            'POST',
            '/api/v1/music/create',
            {
              prompt: input.prompt,
              style: input.style,
              title: input.title,
              instrumental: input.instrumental,
              lyrics: input.lyrics,
              model,
              callBackUrl: 'https://ddinggok.com/api/kie-callback',
            },
            user
              ? { name: user.name, provider: user.provider }
              : undefined,
          );

          const taskId = genRes.data?.taskId as string;
          if (!taskId) throw new Error('No taskId returned');
          setGenTaskId(taskId);
          setGenStatus('AI가 작곡 중...');

          const result = await pollResult(
            taskId,
            (p, status, eta) => {
              setGenProgress(p);
              setGenStatus(
                status === 'completed' ? '완료!' : 'AI가 작곡 중...',
              );
              setGenEta(eta);
            },
            abortRef.current.signal,
          );

          const r = result.result ?? {};
          track = {
            id:
              Date.now().toString(36) +
              Math.random().toString(36).slice(2),
            taskId,
            title: input.title || r.title || 'Untitled',
            audio_url: r.audio_url || '',
            video_url: r.video_url,
            image_url: r.image_url,
            tags: r.tags || input.style,
            lyrics: input.lyrics || r.lyrics,
            created: Date.now(),
            type: r.video_url ? 'video' : 'audio',
            genMode: 'custom',
            model,
            duration: r.duration,
            _owner: user
              ? {
                  name: user.name,
                  avatar: user.avatar,
                  provider: user.provider,
                }
              : undefined,
          };
        }

        addTrack(track);
        if (user) {
          await saveTrack(track, {
            name: user.name,
            provider: user.provider,
          }).catch(() => {});
        }
        if (!user) incGuestUsage();

        setGenProgress(100);
        setGenStatus('완료!');
        addToast('곡이 생성되었습니다!', 'success');
        return track;
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'Cancelled') {
          addToast('생성이 취소되었습니다', 'info');
        } else {
          addToast(
            `생성 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
            'error',
          );
        }
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [store],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    store.cancelGen();
  }, [store]);

  return { generate, cancel };
}
