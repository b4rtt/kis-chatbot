"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useChatController,
  Citation,
} from "./components/useChatController";

const PRIMARY = "#ff6200";

export default function Page() {
  const { q, setQ, msgs, loading, error, ask, totals } = useChatController();
  const [openSources, setOpenSources] = useState<{
    question: string;
    citations: Citation[];
  } | null>(null);

  const totalUsd = totals.usd;
  const totalTokens = totals.tokens;

  const formatUsd = (value: number) => {
    if (value >= 1) return value.toFixed(2);
    if (value >= 0.01) return value.toFixed(3);
    return value.toFixed(4);
  };

  const handleAsk = () => {
    if (!loading && q.trim()) {
      void ask();
    }
  };

  return (
    <main className="page">
      <div className="shell">
        <header className="hero">
          <div>
            <h1>eSports Chatbot</h1>
            <p className="lede">
              Přidáváš dotazy, my kombinujeme lokální index a OpenAI. Vše pod
              kontrolou, včetně nákladů.
            </p>
          </div>
          <div className="metrics">
            <div className="metric">
              <span className="label">Náklady (USD)</span>
              <span className="value">${formatUsd(totalUsd)}</span>
            </div>
            <div className="metric">
              <span className="label">Počet dotazů</span>
              <span className="value">{msgs.length}</span>
            </div>
            <div className="metric">
              <span className="label">Tokeny</span>
              <span className="value">{totalTokens}</span>
            </div>
          </div>
        </header>

        <section className="composer">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Zeptej se na dokumentaci…"
          />
          <button onClick={handleAsk} disabled={loading}>
            {loading ? "Probíhá…" : "Zeptat se"}
          </button>
        </section>
        {error ? <p className="error">{error}</p> : null}

        <section className="thread">
          {msgs.length === 0 ? (
            <div className="placeholder">
              <h3>Připraveni?</h3>
              <p>
                Vlož dotaz a sleduj, jak se odpověď složí z lokálních dokumentů.
                Kliknutím na zdroje kdykoliv zjistíš, odkud informace pochází.
              </p>
            </div>
          ) : (
            msgs.map((m, i) => (
              <article key={`${m.q}-${i}`} className="bubble">
                <div className="question">
                  <span className="badge">Ty</span>
                  <p>{m.q}</p>
                </div>
                <div className="answer">
                  <span className="badge answer-badge">Bot</span>
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.a}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="meta">
                  <div>
                    <span>Náklady: ${formatUsd(m.cost?.usd ?? 0)}</span>
                    <span>Tokeny: {m.cost?.tokens.total ?? 0}</span>
                  </div>
                  {m.c?.length ? (
                    <button
                      className="sources-btn"
                      onClick={() =>
                        setOpenSources({ question: m.q, citations: m.c })
                      }
                    >
                      Zdroje ({m.c.length})
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      {openSources ? (
        <div className="modal-backdrop" onClick={() => setOpenSources(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <p className="eyebrow">Zdroje</p>
                <h3>{openSources.question}</h3>
              </div>
              <button
                className="close"
                onClick={() => setOpenSources(null)}
                aria-label="Zavřít modal se zdroji"
              >
                x
              </button>
            </header>
            <div className="modal-body">
              {openSources.citations.map((c) => (
                <div key={c.id} className="citation">
                  <div className="citation-id">#{c.id}</div>
                  <div>
                    <p className="file">{c.file}</p>
                    <p className="score">Relevance {c.score.toFixed(3)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        :global(body) {
          margin: 0;
          background: #050608;
          font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }
        .page {
          min-height: 100vh;
          color: #f2f4f7;
          background: radial-gradient(
              circle at top,
              rgba(255, 98, 0, 0.18),
              transparent 45%
            ),
            linear-gradient(135deg, #0b111e, #050608 70%);
          padding: 48px 16px 80px;
        }
        .shell {
          max-width: 960px;
          margin: 0 auto;
        }
        .hero {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          padding: 32px;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 24px;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
        }
        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 8px;
        }
        h1 {
          margin: 0;
          font-size: 2.4rem;
        }
        .lede {
          margin-top: 12px;
          color: rgba(255, 255, 255, 0.75);
          max-width: 520px;
        }
        .metrics {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        .metric {
          min-width: 150px;
          padding: 16px 20px;
          border-radius: 16px;
          background: rgba(255, 98, 0, 0.12);
          border: 1px solid rgba(255, 98, 0, 0.4);
        }
        .metric:nth-child(2) {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.08);
        }
        .metric:nth-child(3) {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.08);
        }
        .label {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.6);
        }
        .value {
          display: block;
          margin-top: 8px;
          font-size: 1.6rem;
          font-weight: 600;
        }
        .composer {
          display: flex;
          gap: 12px;
          margin-top: 32px;
        }
        .composer input {
          flex: 1;
          padding: 16px 20px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          font-size: 1rem;
        }
        .composer input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }
        .composer button {
          border: none;
          border-radius: 14px;
          padding: 0 28px;
          background: ${PRIMARY};
          color: #0b111e;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .composer button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .composer button:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 25px rgba(255, 98, 0, 0.4);
        }
        .error {
          color: #ffb3a6;
          margin-top: 12px;
        }
        .thread {
          margin-top: 32px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .placeholder {
          border: 1px dashed rgba(255, 255, 255, 0.2);
          padding: 32px;
          border-radius: 20px;
          text-align: center;
          color: rgba(255, 255, 255, 0.7);
        }
        .bubble {
          padding: 24px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.35);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .question,
        .answer {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .answer p,
        .question p {
          margin: 0;
          white-space: pre-wrap;
        }
        .markdown-content {
          flex: 1;
          line-height: 1.6;
        }
        .markdown-content p {
          margin: 0 0 12px 0;
        }
        .markdown-content p:last-child {
          margin-bottom: 0;
        }
        .markdown-content strong {
          color: ${PRIMARY};
          font-weight: 600;
        }
        .markdown-content em {
          font-style: italic;
          color: rgba(255, 255, 255, 0.85);
        }
        .markdown-content a {
          color: ${PRIMARY};
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: border-color 150ms ease;
        }
        .markdown-content a:hover {
          border-bottom-color: ${PRIMARY};
        }
        .markdown-content code {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono",
            Consolas, "Courier New", monospace;
          font-size: 0.9em;
        }
        .markdown-content pre {
          background: rgba(255, 255, 255, 0.05);
          padding: 12px 16px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 8px 0;
        }
        .markdown-content pre code {
          background: transparent;
          padding: 0;
        }
        .markdown-content ul,
        .markdown-content ol {
          margin: 8px 0;
          padding-left: 24px;
        }
        .markdown-content li {
          margin: 4px 0;
        }
        .markdown-content blockquote {
          border-left: 3px solid ${PRIMARY};
          padding-left: 16px;
          margin: 12px 0;
          color: rgba(255, 255, 255, 0.8);
          font-style: italic;
        }
        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3 {
          margin: 16px 0 8px 0;
          color: ${PRIMARY};
        }
        .markdown-content h1 {
          font-size: 1.5rem;
        }
        .markdown-content h2 {
          font-size: 1.3rem;
        }
        .markdown-content h3 {
          font-size: 1.1rem;
        }
        .badge {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.75rem;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.75);
        }
        .answer-badge {
          background: rgba(255, 98, 0, 0.25);
          color: #ffede3;
        }
        .meta {
          margin-top: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.7);
        }
        .meta > div span + span {
          margin-left: 12px;
        }
        .sources-btn {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: #fff;
          border-radius: 999px;
          padding: 6px 16px;
          cursor: pointer;
        }
        .sources-btn:hover {
          border-color: ${PRIMARY};
          color: ${PRIMARY};
        }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 10;
        }
        .modal {
          background: #0d1220;
          border-radius: 24px;
          max-width: 640px;
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
          padding: 28px;
        }
        .modal-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 16px;
        }
        .modal-head h3 {
          margin: 0;
        }
        .close {
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
        }
        .modal-body {
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 60vh;
          overflow-y: auto;
        }
        .citation {
          display: flex;
          gap: 16px;
          padding: 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .citation-id {
          font-weight: 600;
          color: ${PRIMARY};
        }
        .file {
          margin: 0;
          font-weight: 600;
        }
        .score {
          margin: 4px 0 0;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.85rem;
        }

        @media (max-width: 640px) {
          .hero {
            padding: 24px;
          }
          h1 {
            font-size: 1.8rem;
          }
          .composer {
            flex-direction: column;
          }
          .composer button {
            width: 100%;
            padding: 14px;
          }
        }
      `}</style>
    </main>
  );
}
