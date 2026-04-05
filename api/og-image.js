import { ImageResponse } from '@vercel/og';

function truncate(s, max) {
  s = String(s || '');
  return s.length > max ? s.slice(0, max) + '...' : s;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const title = truncate(searchParams.get('title') || '\uB744\uACE1', 30);
  const artist = truncate(searchParams.get('artist') || 'AI Music', 20);
  const tags = truncate(searchParams.get('tags') || 'AI Generated', 40);

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a0a1a 100%)',
          padding: '60px 80px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: '100px',
                right: '120px',
                width: '300px',
                height: '300px',
                borderRadius: '50%',
                border: '2px solid rgba(124,58,237,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
              children: {
                type: 'div',
                props: {
                  style: { fontSize: '80px', opacity: 0.3 },
                  children: '\uD83C\uDFB5',
                },
              },
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: '18px',
                color: '#7c3aed',
                fontWeight: 700,
                letterSpacing: '3px',
                marginBottom: '16px',
              },
              children: "KENNY'S MUSIC STUDIO",
            },
          },
          {
            type: 'div',
            props: {
              style: {
                width: '80px',
                height: '4px',
                borderRadius: '2px',
                background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                marginBottom: '40px',
              },
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: '52px',
                color: '#ffffff',
                fontWeight: 800,
                marginBottom: '16px',
                lineHeight: 1.2,
              },
              children: title,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: '28px',
                color: '#a78bfa',
                marginBottom: '12px',
              },
              children: artist,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: '18px',
                color: '#9ca3af',
                marginBottom: '40px',
              },
              children: tags,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      padding: '14px 32px',
                      borderRadius: '25px',
                      background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                      color: '#fff',
                      fontSize: '18px',
                      fontWeight: 700,
                    },
                    children: 'AI\uB85C \uC74C\uC545 \uB9CC\uB4E4\uAE30 \u2192',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { fontSize: '14px', color: '#6b7280' },
                    children: 'ddinggok.com',
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { width: 1200, height: 630 }
  );
}
