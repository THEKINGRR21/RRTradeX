"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { apiFetch, useApi } from "@/lib/client";
import { ErrorBox, Markdown, Spinner, fmtDate } from "@/components/ui";

export default function Lesson({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useApi<any>(`/learning/content/${id}`);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const sent = useRef(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => { if (data) { setPct(Number(data.content.progressPct)); sent.current = Number(data.content.progressPct); setDone(data.content.completedAt); } }, [data]);
  useEffect(() => {
    if (!data || data.content.status !== "published") return;
    const onScroll = () => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const seen = Math.min(100, Math.max(0, ((window.innerHeight - r.top) / r.height) * 100));
      const step = Math.floor(seen / 25) * 25; // record in 25% steps, capped below 100 until marked complete
      if (step > sent.current && step < 100) { sent.current = step; setPct(step); apiFetch(`/learning/content/${id}/progress`, { method: "PUT", json: { progressPct: step } }).catch(() => {}); }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [data, id]);

  async function complete() {
    const r = await apiFetch(`/learning/content/${id}/progress`, { method: "PUT", json: { progressPct: 100 } });
    setPct(100); setDone(r.completedAt); sent.current = 100;
  }
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner />;
  const c = data.content;
  return (
    <article ref={ref} className="mx-auto max-w-3xl">
      <Link href="/learn" className="text-xs text-mist-400 hover:text-brand">← Learning Centre</Link>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-brand">{c.category} · {c.difficulty} · {c.durationMin} min {c.contentType}</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{c.title}</h1>
      <p className="mt-2 text-mist-400">{c.description}</p>
      <div className="mt-2 text-xs text-mist-500">By {c.publisher} · updated {fmtDate(c.updatedAt)}{c.status !== "published" && <span className="ml-2 chip bg-orange-950 text-orange-300">{c.status} — preview</span>}</div>
      <div className="sticky top-[82px] z-10 mt-6 h-1 overflow-hidden rounded-full bg-ink-800"><div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
      {c.url && (
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="card card-pad mt-6 flex items-center justify-between hover:border-brand">
          <span><span className="label block">{c.contentType === "video" ? "Watch video" : "External resource"}</span><span className="text-sm text-mist-300">{new URL(c.url).hostname}</span></span><span className="text-brand">↗</span>
        </a>
      )}
      <Markdown text={c.body} className="mt-6" />
      <div className="card card-pad mt-10 flex flex-wrap items-center justify-between gap-3">
        {done ? <span className="text-sm text-gain">✓ Completed {fmtDate(done)}</span> : <span className="text-sm text-mist-400">Finished reading?</span>}
        <div className="flex gap-2">
          <Link href={`/assistant?q=${encodeURIComponent("Explain " + c.title.toLowerCase() + " in simple terms")}`} className="btn-ghost">Ask the AI tutor</Link>
          {!done && c.status === "published" && <button onClick={complete} className="btn-primary">Mark as complete</button>}
        </div>
      </div>
    </article>
  );
}
