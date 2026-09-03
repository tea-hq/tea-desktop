import { authCallbackMessages } from '../../src/locales/authCallback'

export const CENTER_AUTH_CALLBACK_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
} as const

export function centerAuthCallbackPage(acceptLanguage?: string): string {
  const locale = acceptLanguage?.trim().toLocaleLowerCase('en').startsWith('zh') ? 'zh-CN' : 'en'
  const copy = locale === 'zh-CN' ? authCallbackMessages['zh-CN'] : authCallbackMessages.en

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${copy.title} · Tea</title>
    <style>
      :root {
        color-scheme: light dark;
        --canvas: #ffffff;
        --panel: #f8f9fa;
        --surface-card: #f5f5f5;
        --ink: #111111;
        --body: #374151;
        --muted: #6b7280;
        --hairline: #e5e7eb;
        --hairline-soft: #f3f4f6;
        --success: #10b981;
        --success-subtle: #ecfdf5;
      }

      * {
        box-sizing: border-box;
      }

      html {
        background: var(--canvas);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI",
          "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        -webkit-text-size-adjust: 100%;
      }

      body {
        min-height: 100vh;
        min-height: 100svh;
        margin: 0;
        background: var(--canvas);
        color: var(--ink);
      }

      .page {
        width: min(100%, 760px);
        min-height: 100vh;
        min-height: 100svh;
        margin: 0 auto;
        padding: 40px 32px 32px;
        display: flex;
        flex-direction: column;
      }

      .masthead {
        min-height: 48px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--hairline);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: var(--ink);
        font-family: "Cal Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 0;
      }

      .brand-mark {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: var(--ink);
        color: var(--canvas);
        font-size: 15px;
        line-height: 1;
      }

      .context {
        color: var(--muted);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.4;
        letter-spacing: 0;
      }

      .receipt {
        flex: 1;
        padding: 64px 0;
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        align-content: center;
        gap: 32px;
        animation: enter 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .status-mark {
        width: 72px;
        height: 72px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: var(--success-subtle);
        color: var(--success);
      }

      .status-mark svg {
        width: 36px;
        height: 36px;
      }

      .eyebrow {
        margin: 0 0 12px;
        color: var(--success);
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
        letter-spacing: 0;
      }

      h1 {
        max-width: 580px;
        margin: 0;
        font-family: "Cal Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI",
          "PingFang SC", sans-serif;
        font-size: 36px;
        font-weight: 600;
        line-height: 1.15;
        letter-spacing: 0;
      }

      .description {
        max-width: 520px;
        margin: 16px 0 0;
        color: var(--body);
        font-size: 16px;
        line-height: 1.6;
        letter-spacing: 0;
      }

      .handoff {
        max-width: 520px;
        margin-top: 32px;
        padding: 20px 0;
        border-top: 1px solid var(--hairline);
        border-bottom: 1px solid var(--hairline);
        display: grid;
        grid-template-columns: minmax(0, 1fr) 24px;
        align-items: center;
        gap: 20px;
      }

      .handoff strong {
        display: block;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
      }

      .handoff p {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }

      .handoff svg {
        width: 20px;
        height: 20px;
        color: var(--ink);
      }

      .status-line {
        margin-top: 20px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.4;
      }

      .status-dot {
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 9999px;
        background: var(--success);
      }

      .footer {
        min-height: 48px;
        padding-top: 20px;
        border-top: 1px solid var(--hairline-soft);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      .footer span:last-child {
        text-align: right;
      }

      @keyframes enter {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 560px) {
        .page {
          padding: 24px 20px 20px;
        }

        .masthead {
          padding-bottom: 20px;
        }

        .receipt {
          padding: 48px 0;
          grid-template-columns: minmax(0, 1fr);
          gap: 24px;
        }

        .status-mark {
          width: 64px;
          height: 64px;
        }

        h1 {
          font-size: 30px;
        }

        .footer {
          flex-direction: column;
          gap: 8px;
        }

        .footer span:last-child {
          text-align: left;
        }
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --canvas: #111111;
          --panel: #1f1f1f;
          --surface-card: #242424;
          --ink: #f5f5f5;
          --body: #d1d5db;
          --muted: #a1a1aa;
          --hairline: #3f3f46;
          --hairline-soft: #27272a;
          --success: #34d399;
          --success-subtle: #12352b;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .receipt {
          animation: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="masthead">
        <div class="brand"><span class="brand-mark" aria-hidden="true">T</span><span>Tea</span></div>
        <span class="context">${copy.context}</span>
      </header>
      <main class="receipt">
        <div class="status-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10s10-4.5 10-10S17.5 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8m4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4l8-8z"/></svg>
        </div>
        <div>
          <p class="eyebrow">${copy.eyebrow}</p>
          <h1>${copy.title}</h1>
          <p class="description">${copy.description}</p>
          <div class="handoff">
            <div>
              <strong>${copy.returnTitle}</strong>
              <p>${copy.returnDescription}</p>
            </div>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 17.59L15.59 7H9V5h10v10h-2V8.41L6.41 19z"/></svg>
          </div>
          <div class="status-line"><span class="status-dot" aria-hidden="true"></span>${copy.status}</div>
        </div>
      </main>
      <footer class="footer">
        <span>${copy.privacy}</span>
        <span>Tea Desktop · 127.0.0.1</span>
      </footer>
    </div>
  </body>
</html>`
}
