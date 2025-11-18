"use client";

import { Suspense, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { useSearchParams } from "next/navigation";
import remarkGfm from "remark-gfm";
import { useChatController } from "../../components/useChatController";

const FALLBACK_ACCENT = "#ff6200";

export default function WidgetPanelPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <WidgetPanelInner />
    </Suspense>
  );
}

function PanelFallback() {
  return (
    <div className="widget-shell">
      <div className="widget-head skeleton" />
      <div className="widget-thread skeleton" />
      <style jsx>{`
        :global(body) {
          margin: 0;
          font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
          background: #050608;
        }
        .widget-shell {
          min-height: 100vh;
          padding: 20px;
          background: linear-gradient(180deg, #111624, #050608);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .skeleton {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          min-height: 120px;
          animation: pulse 1.4s ease-in-out infinite;
        }
        .widget-head.skeleton {
          min-height: 96px;
        }
        @keyframes pulse {
          0% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.9;
          }
          100% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}

function WidgetPanelInner() {
  const searchParams = useSearchParams();
  const accent = searchParams.get("accent") ?? FALLBACK_ACCENT;
  const title = searchParams.get("title") ?? "eSports Chatbot";
  const subtitle =
    searchParams.get("subtitle") ?? "Ptej se na dokumentaci, která je v indexu.";

  const { q, setQ, msgs, loading, error, ask } = useChatController();

  const orderedMessages = useMemo(() => [...msgs].reverse(), [msgs]);

  const handleAsk = () => {
    if (!q.trim() || loading) return;
    void ask();
  };

  const handleClose = () => {
    window.parent?.postMessage({ type: "esports-chat-close" }, "*");
  };

  return (
    <div className="widget-shell">
      <header className="widget-head">
        <div>
          <p className="eyebrow">Virtuální asistent</p>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
        <button
          type="button"
          className="close"
          aria-label="Zavřít chat"
          onClick={handleClose}
        >
          ×
        </button>
      </header>

      <section className="widget-thread" aria-live="polite">
        {orderedMessages.length === 0 ? (
          <div className="placeholder">
            <h3>Jak ti můžeme pomoct?</h3>
            <p>Zeptej se na konkrétní část dokumentace a odpovíme s odkazy.</p>
          </div>
        ) : (
          orderedMessages.map((msg, index) => (
            <div key={`${msg.q}-${index}`} className="entry">
              <div className="bubble user">{msg.q}</div>
              <div className="bubble bot">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.a}
                </ReactMarkdown>
                {msg.c?.length ? (
                  <div className="sources">
                    <span>Zdroje:</span>
                    <ul>
                      {msg.c.slice(0, 3).map((c) => (
                        <li key={`${c.file}-${c.id}`}>
                          <span className="source-id">#{c.id}</span>
                          <span className="source-file">{c.file}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>

      {error ? <p className="error">{error}</p> : null}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          handleAsk();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zeptej se…"
          aria-label="Zadat dotaz"
          onKeyDown={(e) => e.key === "Escape" && handleClose()}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Probíhá…" : "Odeslat"}
        </button>
      </form>

      <p className="footnote">
        Běží nad lokálními embeddingy. Odpovědi jsou vždy z vašeho obsahu.
      </p>

      <style jsx>{`
        :global(body) {
          margin: 0;
          font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
          background: #050608;
          color: #f2f4f7;
        }
        .widget-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 20px;
          background: linear-gradient(180deg, #111624, #050608);
        }
        .widget-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 20px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .widget-head h1 {
          margin: 0;
          font-size: 1.4rem;
        }
        .subtitle {
          margin: 6px 0 0;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.9rem;
        }
        .eyebrow {
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
          margin: 0 0 6px;
        }
        .close {
          border: none;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 1.4rem;
          cursor: pointer;
        }
        .widget-thread {
          flex: 1;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          overflow-y: auto;
        }
        .placeholder {
          margin: auto;
          text-align: center;
          color: rgba(255, 255, 255, 0.65);
          max-width: 260px;
        }
        .entry {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bubble {
          border-radius: 16px;
          padding: 12px 14px;
          font-size: 0.95rem;
          line-height: 1.5;
        }
        .bubble.user {
          align-self: flex-end;
          background: rgba(255, 255, 255, 0.08);
        }
        .bubble.bot {
          align-self: flex-start;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .bubble :global(p) {
          margin: 0 0 8px;
        }
        .bubble :global(p:last-child) {
          margin-bottom: 0;
        }
        .bubble :global(code) {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 4px;
          border-radius: 4px;
        }
        .bubble :global(pre) {
          background: rgba(5, 6, 8, 0.8);
          padding: 8px;
          border-radius: 8px;
          overflow: auto;
        }
        .sources {
          margin-top: 10px;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.7);
        }
        .sources ul {
          padding-left: 16px;
          margin: 6px 0 0;
        }
        .source-id {
          color: ${accent};
          font-weight: 600;
          margin-right: 6px;
        }
        .composer {
          display: flex;
          gap: 10px;
        }
        .composer input {
          flex: 1;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          padding: 12px 14px;
        }
        .composer button {
          border: none;
          border-radius: 12px;
          background: ${accent};
          color: #050608;
          font-weight: 600;
          padding: 0 20px;
          cursor: pointer;
        }
        .composer button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .error {
          color: #ffb3a6;
          font-size: 0.85rem;
          margin: 0;
        }
        .footnote {
          margin: 0;
          font-size: 0.75rem;
          text-align: center;
          color: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
}
