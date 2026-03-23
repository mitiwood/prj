/**
 * Sentry 초기화 — 서버리스 공용 모듈
 * 사용법: import { Sentry, withSentry } from './lib/sentry.js';
 */
import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN || '';

let _initialized = false;

function initSentry() {
  if (_initialized || !SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'development',
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // PII 제거
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
  _initialized = true;
}

/**
 * API 핸들러 래퍼 — 에러 자동 캡처 + flush
 * @param {Function} handler - (req, res) => Promise
 * @returns {Function} wrapped handler
 */
export function withSentry(handler) {
  return async (req, res) => {
    initSentry();
    try {
      return await handler(req, res);
    } catch (err) {
      if (SENTRY_DSN) {
        Sentry.captureException(err, {
          extra: {
            method: req.method,
            url: req.url,
            query: req.query,
          },
        });
        await Sentry.flush(2000);
      }
      console.error('[Sentry]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    }
  };
}

export { Sentry };
export default initSentry;
