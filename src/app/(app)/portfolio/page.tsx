"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useApi } from "@/lib/client";
import { useMe } from "@/lib/session-client";
import { Card, Empty, ErrorBox, PageHeader, Pct, QuoteMeta, Signed, Spinner, Stat, fmtINR, fmtDate } from "@/components/ui";

const COLORS = ["#f5b93a", "#38bdf8", "#a78bfa", "#22c55e", "#f472b6", "#fb923c", "#2dd4bf", "#94a3b8"];

export default function Portfolio() {
  const { data: me } = useMe();
  const { data: p, error } = useApi<any>("/portfolio", { refreshMs: 15_000 });
  const { data: hist } = useApi<any>("/portfolio/history");
  const { data: tr } = useApi<any>(me?.user.role === "trader" ? "/trades?limit=500" : null);
  const sectors = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of p?.holdings ?? []) m.set(h.sector, (m.get(h.sector) ?? 0) + Number(h.marketValue));
    if (p && Number(p.summary.cashBalance) > 0) m.set("Cash", Number(p.summary.cashBalance));
    return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [p]);
  const analytics = useMemo(() => {
    const sells = (tr?.trades ?? []).filter((t: any) => t.side === "sell");
    if (!tr) return null;
    const wins = sells.filter((t: any) => Number(t.realizedPnl) > 0);
    const fees = (tr.trades as any[]).reduce((s, t) => s + Number(t.fees), 0);
    const turnover = (tr.trades as any[]).reduce((s, t) => s + Number(t.grossAmount), 0);
    const best = [...sells].sort((a: any, b: any) => Number(b.realizedPnl) - Number(a.realizedPnl))[0];
    const worst = [...sells].sort((a: any, b: any) => Number(a.realizedPnl) - Number(b.realizedPnl))[0];
    return { trades: tr.trades.length, closed: sells.length, winRate: sells.length ? (wins.length / sells.length) * 100 : null, fees, turnover, best, worst };
  }, [tr]);
  if (error) return <ErrorBox msg={error} />;
  if (!p) return <Spinner />;
  const s = p.summary;
  const series = (hist?.snapshots ?? []).map((x: any) => ({ t: x.captured_at, v: Number(x.total_value) }));
  return (
    <>
      <PageHeader title="Portfolio" sub={<>Virtual paper-trading portfolio · valued {new Date(p.valuation.asOf).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total value" value={fmtINR(s.totalValue)} sub={<>Since start <Signed v={s.totalReturn} /> (<Pct v={s.totalReturnPct} />)</>} />
        <Stat label="Holdings value" value={fmtINR(s.holdingsValue)} sub={`Cost basis ${fmtINR(s.investedCost)}`} />
        <Stat label="Unrealised P&L" value={<Signed v={s.unrealizedPnl} />} sub={<>Holdings&apos; 24h price move <Signed v={s.dayChange} /></>} />
        <Stat label="Realised P&L" value={<Signed v={s.realizedPnl} />} sub="After fees, average-cost method" />
      </div>
      {p.valuation.disclosures.length > 0 && <div className="mt-4 rounded-lg border border-orange-800 bg-orange-950/40 px-4 py-2 text-xs text-orange-300">⚠ {p.valuation.disclosures.join(" ")}</div>}
      <Card title="Holdings" className="mt-6" pad={false}>
        {p.holdings.length ? (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Instrument</th><th className="text-right">Qty</th><th className="text-right">Avg cost</th><th className="text-right">LTP</th><th className="text-right">Value</th><th className="text-right">Unrealised</th><th className="text-right">Realised</th><th className="text-right">Weight</th><th className="hidden xl:table-cell">Quote</th></tr></thead>
            <tbody>{p.holdings.map((h: any) => (
              <tr key={h.symbol}>
                <td><Link href={`/markets/${h.symbol}`} className="font-semibold hover:text-brand">{h.symbol}</Link><div className="text-[11px] text-mist-500">{h.sector}</div></td>
                <td className="num text-right">{Number(h.quantity)}</td><td className="num text-right">{fmtINR(h.avgBuyPrice)}</td><td className="num text-right">{fmtINR(h.lastPrice)}</td>
                <td className="num text-right font-semibold">{fmtINR(h.marketValue)}</td>
                <td className="text-right"><Signed v={h.unrealizedPnl} /><div className="text-[11px]"><Pct v={h.unrealizedPct} /></div></td>
                <td className="text-right"><Signed v={h.realizedPnl} /></td><td className="num text-right text-mist-300">{h.weightPct}%</td>
                <td className="hidden xl:table-cell"><QuoteMeta q={h.quote} compact /></td>
              </tr>))}
            </tbody></table></div>
        ) : <Empty>No open positions. <Link href="/markets" className="text-brand">Browse markets →</Link></Empty>}
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Allocation by sector">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-52 w-52 shrink-0"><ResponsiveContainer><PieChart><Pie data={sectors} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} stroke="#0b111b" isAnimationActive={false}>{sectors.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => fmtINR(v)} contentStyle={{ background: "#0f1724", border: "1px solid #2a3850", borderRadius: 8, fontSize: 12 }} /></PieChart></ResponsiveContainer></div>
            <ul className="w-full space-y-1.5 text-sm">{sectors.map((x, i) => (
              <li key={x.name} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{x.name}</span><span className="num text-mist-300">{((x.value / Number(s.totalValue)) * 100).toFixed(1)}%</span></li>))}
            </ul>
          </div>
        </Card>
        <Card title="Value history (snapshots)">
          {series.length > 1 ? (
            <div className="h-52"><ResponsiveContainer><LineChart data={series}><CartesianGrid stroke="#1c2738" vertical={false} /><XAxis dataKey="t" tickFormatter={(t) => fmtDate(t).slice(0, 6)} stroke="#5f6e86" fontSize={11} minTickGap={40} tickLine={false} axisLine={false} /><YAxis stroke="#5f6e86" fontSize={11} width={84} tickFormatter={(v) => fmtINR(v, true)} domain={["auto", "auto"]} tickCount={5} tickLine={false} axisLine={false} /><Tooltip formatter={(v: any) => fmtINR(v)} labelFormatter={(t: any) => new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} contentStyle={{ background: "#0f1724", border: "1px solid #2a3850", borderRadius: 8, fontSize: 12 }} /><Line type="stepAfter" dataKey="v" stroke="#f5b93a" dot={false} strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
          ) : <Empty>Snapshots are recorded after each trade and daily. Make a trade to start your history.</Empty>}
        </Card>
      </div>
      {analytics && (
        <Card title="Trade analytics · Trader" className="mt-6">
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-6">
            <div><dt className="label">Executions</dt><dd className="num mt-1 text-lg font-semibold">{analytics.trades}</dd></div>
            <div><dt className="label">Closing sells</dt><dd className="num mt-1 text-lg font-semibold">{analytics.closed}</dd></div>
            <div><dt className="label">Win rate</dt><dd className="num mt-1 text-lg font-semibold">{analytics.winRate == null ? "—" : analytics.winRate.toFixed(0) + "%"}</dd></div>
            <div><dt className="label">Turnover</dt><dd className="num mt-1 text-lg font-semibold">{fmtINR(analytics.turnover, true)}</dd></div>
            <div><dt className="label">Fees paid</dt><dd className="num mt-1 text-lg font-semibold">{fmtINR(analytics.fees)}</dd></div>
            <div><dt className="label">Best / worst</dt><dd className="mt-1 text-sm">{analytics.best ? <><Signed v={analytics.best.realizedPnl} /> {analytics.best.symbol}{analytics.closed > 1 && <><br /><Signed v={analytics.worst.realizedPnl} /> {analytics.worst.symbol}</>}</> : "—"}</dd></div>
          </dl>
        </Card>
      )}
      <p className="mt-6 text-xs leading-5 text-mist-500">Methodology: {p.valuation.method}</p>
    </>
  );
}
