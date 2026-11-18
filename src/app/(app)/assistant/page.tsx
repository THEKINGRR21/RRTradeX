"use client";
import clsx from "clsx";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, useApi } from "@/lib/client";
import { ErrorBox, Markdown, fmtTime } from "@/components/ui";

const SUGGEST = ["What's the difference between a market and a limit order?", "How is my portfolio doing?", "Explain realised vs unrealised P&L", "What is the price of RELIANCE?", "Why would my order be rejected?", "What are moving averages?"];

function Chat() {
  const sp = useSearchParams();
  const { data: sessions, reload } = useApi<any>("/ai/sessions");
  const [sid, setSid] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    const q = sp.get("q");
    if (q && !seeded.current) { seeded.current = true; send(q, null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(id: string) { setSid(id); setErr(null); const r = await apiFetch(`/ai/sessions/${id}`); setMsgs(r.messages); }
  async function send(t: string, current = sid) {
    if (!t.trim() || busy) return;
    setBusy(true); setErr(null); setText("");
    try {
      let id = current;
      if (!id) { const s = await apiFetch("/ai/sessions", { method: "POST", json: {} }); id = s.id; setSid(id); setMsgs([]); }
      setMsgs((m) => [...m, { id: "tmp", sender: "user", text: t, created_at: new Date().toISOString() }]);
      const r = await apiFetch(`/ai/sessions/${id}/messages`, { method: "POST", json: { text: t } });
      setMsgs((m) => [...m.filter((x) => x.id !== "tmp"), r.userMessage, r.assistantMessage]);
      reload();
    } catch (e: any) { setErr(e.message); setMsgs((m) => m.filter((x) => x.id !== "tmp")); }
    finally { setBusy(false); }
  }
  async function del(id: string) { await apiFetch(`/ai/sessions/${id}`, { method: "DELETE" }); if (sid === id) { setSid(null); setMsgs([]); } reload(); }

  return (
    <div className="grid h-[calc(100vh-11rem)] gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="card hidden flex-col overflow-hidden lg:flex">
        <button className="btn-primary m-3" onClick={() => { setSid(null); setMsgs([]); }}>+ New chat</button>
        <ul className="flex-1 overflow-y-auto px-2 pb-2">
          {sessions?.sessions.map((s: any) => (
            <li key={s.id} className={clsx("group flex items-center rounded-lg", sid === s.id && "bg-ink-800")}>
              <button onClick={() => open(s.id)} className="flex-1 truncate px-3 py-2 text-left text-sm text-mist-300 hover:text-mist-100">{s.title}</button>
              <button onClick={() => del(s.id)} aria-label="Delete conversation" className="px-2 text-xs text-mist-500 opacity-0 hover:text-loss group-hover:opacity-100">✕</button>
            </li>))}
        </ul>
      </aside>
      <section className="card flex min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <div><h1 className="font-semibold">AI learning assistant</h1><p className="text-xs text-mist-500">Read-only · explains concepts and your own data · cannot place or change orders</p></div>
          <button className="btn-ghost px-2.5 py-1 text-xs lg:hidden" onClick={() => { setSid(null); setMsgs([]); }}>New</button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!msgs.length && (
            <div className="mx-auto max-w-xl pt-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-2xl text-brand">✦</div>
              <h2 className="mt-4 text-lg font-semibold">Ask me anything about trading and investing</h2>
              <p className="mt-1 text-sm text-mist-400">I can explain terms, read your paper portfolio and orders, show quotes, and point you to lessons.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">{SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="rounded-lg border border-ink-700 px-3 py-2 text-left text-sm text-mist-300 hover:border-brand hover:text-mist-100">{s}</button>)}</div>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={clsx("flex", m.sender === "user" ? "justify-end" : "justify-start")}>
              <div className={clsx("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", m.sender === "user" ? "bg-brand text-ink-950" : "border border-ink-700 bg-ink-850")}>
                {m.sender === "user" ? <p className="whitespace-pre-wrap">{m.text}</p> : <Markdown text={m.text} className="[&_p]:my-1.5 [&_p]:leading-6" />}
                <div className={clsx("mt-1 text-[10px]", m.sender === "user" ? "text-ink-800" : "text-mist-500")}>{fmtTime(m.created_at, false)}{m.model ? ` · ${m.model}` : ""}</div>
              </div>
            </div>))}
          {busy && <div className="flex"><div className="rounded-2xl border border-ink-700 bg-ink-850 px-4 py-3 text-sm text-mist-400"><span className="animate-pulse">Thinking…</span></div></div>}
          <div ref={end} />
        </div>
        <div className="border-t border-ink-700 p-3">
          <ErrorBox msg={err} />
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="mt-1 flex gap-2">
            <input className="input" placeholder="Ask about a concept, your portfolio, or a stock…" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} aria-label="Message" />
            <button className="btn-primary" disabled={busy || !text.trim()}>Send</button>
          </form>
          <p className="mt-2 text-[11px] text-mist-500">Educational only. Answers may be incomplete or delayed and are not investment advice.</p>
        </div>
      </section>
    </div>
  );
}
export default function AssistantPage() { return <Suspense><Chat /></Suspense>; }
