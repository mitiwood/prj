import { API_BASE, fetchJson } from './base';
import type { Profile } from '../../types';

export async function fetchApiKey(): Promise<string> {
  const res = await fetchJson<{ apiKey?: string }>(`${API_BASE}/config`);
  return res.apiKey ?? '';
}

export async function fetchProfile(
  name: string,
  provider: string,
): Promise<Profile | null> {
  try {
    return await fetchJson<Profile>(
      `${API_BASE}/profile?name=${encodeURIComponent(name)}&provider=${encodeURIComponent(provider)}`,
    );
  } catch {
    return null;
  }
}

export async function fetchToken(user: {
  name: string;
  provider: string;
}): Promise<string> {
  const res = await fetchJson<{ token?: string }>(`${API_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  return res.token ?? '';
}

export async function checkSession(
  name: string,
  provider: string,
): Promise<boolean> {
  try {
    const res = await fetchJson<{ valid?: boolean }>(
      `${API_BASE}/auth/session-check?name=${encodeURIComponent(name)}&provider=${encodeURIComponent(provider)}`,
    );
    return res.valid ?? false;
  } catch {
    return false;
  }
}

export async function checkCredit(
  type: string,
  userName: string,
  userProvider: string,
): Promise<{ allowed: boolean; remaining?: number; message?: string }> {
  return fetchJson(`${API_BASE}/check-credit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, userName, userProvider }),
  });
}
