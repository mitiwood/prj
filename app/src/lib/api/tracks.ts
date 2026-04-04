import { API_BASE, fetchJson } from './base';
import type { Track, CommunityTrack } from '../../types';

export async function saveTrack(
  track: Track,
  user?: { name: string; provider: string },
): Promise<void> {
  await fetchJson(`${API_BASE}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track, user }),
  });
}

export async function fetchCommunityTracks(limit = 50): Promise<CommunityTrack[]> {
  return fetchJson<CommunityTrack[]>(`${API_BASE}/community?limit=${limit}`);
}

export async function likeTrack(
  trackId: string,
  user: { name: string; provider: string },
): Promise<void> {
  await fetchJson(`${API_BASE}/community/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, user }),
  });
}

export async function unlikeTrack(
  trackId: string,
  user: { name: string; provider: string },
): Promise<void> {
  await fetchJson(`${API_BASE}/community/unlike`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId, user }),
  });
}

export async function deleteTrack(
  trackId: string,
  user: { name: string; provider: string },
): Promise<void> {
  await fetchJson(`${API_BASE}/tracks/${trackId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user }),
  });
}

export async function playTrack(trackId: string): Promise<void> {
  await fetchJson(`${API_BASE}/community/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId }),
  }).catch(() => {
    /* non-critical */
  });
}
