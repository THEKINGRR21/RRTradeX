"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/client";
import { ErrorBox, PageHeader, Spinner, Tabs } from "@/components/ui";

const DIFF = { beginner: "text-gain", intermediate: "text-sky-300", advanced: "text-violet-300" } as Record<string, string>;
const ICON = { article: "▤", video: "▶", tutorial: "✎" } as Record<string, string>;

export default function Learn() {
  const { data, error } = useApi<any>("/learning/content");
  const [level, setLevel] = useState<"all" | "beginner" | "intermediate" | "advanced">("all");
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const c of data?.contents ?? []) if (level === "all" || c.difficulty === level) m.set(c.category, [...(m.get(c.category) ?? []), c]);
    return [...m];
  }, [data, level]);
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner />;
  const done = data.contents.filter((c: any) => c.completedAt).length;
  return (
    <>
      <PageHeader title="Learning Centre" sub={`${done} of ${data.contents.length} lessons completed`} action={<Tabs value={level} onChange={setLevel} options={["all", "beginner", "intermediate", "advanced"].map((v) => ({ value: v as any, label: v[0].toUpperCase() + v.slice(1) }))} />} />
      <div className="space-y-8">
        {groups.map(([cat, items]) => (
          <section key={cat}>
            <h2 className="label mb-3">{cat}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => (
                <Link key={c.id} href={`/learn/${c.id}`} className="card card-pad group flex flex-col transition hover:border-brand">
                  <div className="flex items-center justify-between text-xs"><span className={`font-semibold capitalize ${DIFF[c.difficulty]}`}>{c.difficulty}</span><span className="text-mist-500">{ICON[c.contentType]} {c.contentType} · {c.durationMin} min</span></div>
                  <h3 className="mt-2 font-semibold group-hover:text-brand">{c.title}</h3>
                  <p className="mt-1 flex-1 text-sm text-mist-400">{c.description}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800"><div className={`h-full ${c.completedAt ? "bg-gain" : "bg-brand"}`} style={{ width: `${Number(c.progressPct)}%` }} /></div>
                    <span className="num text-[11px] text-mist-400">{c.completedAt ? "✓ Done" : `${Math.round(Number(c.progressPct))}%`}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
