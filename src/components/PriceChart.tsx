"use client";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar } from "recharts";
import { useApi } from "@/lib/client";
import { Spinner, Tabs, fmtINR } from "./ui";

const RANGES = ["1D", "1W", "1M", "6M", "1Y"] as const;
type R = (typeof RANGES)[number];

function sma(v: number[], n: number) { return v.map((_, i) => (i < n - 1 ? null : v.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n)); }
function ema(v: number[], n: number) { const k = 2 / (n + 1); let e: number | null = null; return v.map((x, i) => { e = e == null ? x : x * k + e * (1 - k); return i < n - 1 ? null : e; }); }

/** Instrument chart. Advanced (trader) accounts get SMA 20 / EMA 50 overlays and volume. */
export default function PriceChart({ symbol, advanced }: { symbol: string; advanced: boolean }) {
  const [range, setRange] = useState<R>("1M");
  const [ind, setInd] = useState(true);
  const { data, loading } = useApi<{ history: { t: string; close: string; volume: number }[] }>(`/instruments/${symbol}/quotes?range=${range}`, { refreshMs: range === "1D" ? 30_000 : 0 });
  const pts = useMemo(() => {
    const h = data?.history ?? [];
    const closes = h.map((p) => Number(p.close));
    const s = sma(closes, 20), e = ema(closes, 50);
    return h.map((p, i) => ({ t: p.t, close: closes[i], sma: s[i], ema: e[i], volume: p.volume }));
  }, [data]);
  const up = pts.length > 1 && pts[pts.length - 1].close >= pts[0].close;
  const color = up ? "#22c55e" : "#f43f5e";
  const fmtX = (t: string) => {
    const d = new Date(t);
    return range === "1D" ? d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
  };
  const min = Math.min(...pts.map((p) => p.close)), max = Math.max(...pts.map((p) => p.close));
  const pad = (max - min) * 0.08 || 1;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r }))} />
        {advanced && (
          <label className="flex items-center gap-2 text-xs text-mist-400">
            <input type="checkbox" checked={ind} onChange={(e) => setInd(e.target.checked)} className="accent-[#f5b93a]" />
            SMA 20 <span className="inline-block h-0.5 w-4 bg-sky-400" /> EMA 50 <span className="inline-block h-0.5 w-4 bg-violet-400" />
          </label>
        )}
      </div>
      <div className="h-72 w-full" aria-label={`${symbol} simulated price chart, ${range}`} role="img">
        {loading && !pts.length ? <Spinner /> : (
          <ResponsiveContainer>
            {advanced ? (
              <ComposedChart data={pts} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#1c2738" vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmtX} stroke="#5f6e86" fontSize={11} minTickGap={40} tickLine={false} axisLine={false} />
                <YAxis yAxisId="p" domain={[min - pad, max + pad]} stroke="#5f6e86" fontSize={11} tickFormatter={(v) => v.toFixed(0)} width={52} tickLine={false} axisLine={false} orientation="right" />
                <YAxis yAxisId="v" hide domain={[0, (dataMax: number) => dataMax * 4]} />
                <Tooltip content={<Tip range={range} />} />
                <Bar yAxisId="v" dataKey="volume" fill="#2a3850" isAnimationActive={false} />
                <Area yAxisId="p" type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#g)" isAnimationActive={false} />
                {ind && <Line yAxisId="p" type="monotone" dataKey="sma" stroke="#38bdf8" dot={false} strokeWidth={1.25} isAnimationActive={false} connectNulls />}
                {ind && <Line yAxisId="p" type="monotone" dataKey="ema" stroke="#a78bfa" dot={false} strokeWidth={1.25} isAnimationActive={false} connectNulls />}
              </ComposedChart>
            ) : (
              <AreaChart data={pts} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#1c2738" vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmtX} stroke="#5f6e86" fontSize={11} minTickGap={40} tickLine={false} axisLine={false} />
                <YAxis domain={[min - pad, max + pad]} stroke="#5f6e86" fontSize={11} tickFormatter={(v) => v.toFixed(0)} width={52} tickLine={false} axisLine={false} orientation="right" />
                <Tooltip content={<Tip range={range} />} />
                <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#g)" isAnimationActive={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-[11px] text-mist-500">Simulated price history from the RRTradeX Simulator. Not real exchange data.{!advanced && " Trader accounts can overlay moving averages and volume."}</p>
    </div>
  );
}

function Tip({ active, payload, range }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-xs shadow-xl">
      <div className="text-mist-400">{new Date(p.t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", ...(range === "6M" || range === "1Y" ? {} : { hour: "2-digit", minute: "2-digit" }) })}</div>
      <div className="num mt-0.5 font-semibold text-mist-100">{fmtINR(p.close)}</div>
      {p.sma != null && <div className="num text-sky-400">SMA20 {p.sma.toFixed(2)}</div>}
      {p.ema != null && <div className="num text-violet-400">EMA50 {p.ema.toFixed(2)}</div>}
    </div>
  );
}
