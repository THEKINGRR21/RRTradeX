import { NextResponse } from "next/server";

// OpenAPI 3.1 description of the /api/v1 contract (SRS §7.2, Appendix B).
const err = { $ref: "#/components/responses/Error" };
const auth = [{ session: [] }];
const op = (summary: string, tag: string, extra: object = {}) => ({ summary, tags: [tag], security: auth, responses: { 200: { description: "OK" }, 400: err, 401: err, 403: err, 404: err, 429: err }, ...extra });
const json = (props: Record<string, object>, required: string[] = []) => ({ required: true, content: { "application/json": { schema: { type: "object", properties: props, required } } } });

const spec = {
  openapi: "3.1.0",
  info: { title: "RRTradeX API", version: "1.0.0", description: "Paper-trading & learning platform API. All trading is simulated with virtual funds; market data is simulated." },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: { session: { type: "apiKey", in: "cookie", name: "rrx_session" } },
    responses: { Error: { description: "Error", content: { "application/json": { schema: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {}, requestId: { type: "string" } } } } } } } } },
  },
  paths: {
    "/auth/register": { post: { ...op("Register (creates retail user + virtual wallet)", "Auth"), security: [], requestBody: json({ email: { type: "string" }, password: { type: "string", minLength: 10 }, fullName: { type: "string" }, experienceLevel: { enum: ["beginner", "intermediate", "advanced"] }, acceptTerms: { const: true } }, ["email", "password", "fullName", "acceptTerms"]) } },
    "/auth/login": { post: { ...op("Sign in; sets httpOnly session cookie", "Auth"), security: [], requestBody: json({ email: { type: "string" }, password: { type: "string" } }, ["email", "password"]) } },
    "/auth/logout": { post: op("Sign out (revokes session)", "Auth") },
    "/me": { get: op("Current user, profile and limits", "Account"), patch: { ...op("Update permitted profile fields", "Account"), requestBody: json({ fullName: { type: "string" }, phone: { type: "string" }, riskProfile: { enum: ["conservative", "moderate", "aggressive"] }, experienceLevel: { enum: ["beginner", "intermediate", "advanced"] } }) } },
    "/me/sessions": { get: op("List active sessions", "Account"), delete: op("Sign out everywhere", "Account") },
    "/instruments": { get: { ...op("Search instruments with latest quotes", "Market data"), parameters: [{ name: "q", in: "query" }, { name: "sector", in: "query" }] } },
    "/instruments/{id}": { get: op("Instrument detail, quote and own position (id or symbol)", "Market data") },
    "/instruments/{id}/quotes": { get: { ...op("Latest + historical quotes", "Market data"), parameters: [{ name: "range", in: "query", schema: { enum: ["1D", "1W", "1M", "6M", "1Y"] } }] } },
    "/watchlists": { get: op("List own watchlists with quotes", "Watchlists"), post: { ...op("Create watchlist", "Watchlists"), requestBody: json({ name: { type: "string" } }, ["name"]) } },
    "/watchlists/{id}": { patch: op("Rename watchlist", "Watchlists"), delete: op("Delete watchlist", "Watchlists") },
    "/watchlists/{id}/items": { post: { ...op("Add instrument", "Watchlists"), requestBody: json({ instrumentId: { type: "string", format: "uuid" } }, ["instrumentId"]) } },
    "/watchlists/{id}/items/{instrumentId}": { delete: op("Remove instrument", "Watchlists") },
    "/alerts": { get: op("List own price alerts", "Alerts"), post: { ...op("Create price alert", "Alerts"), requestBody: json({ instrumentId: { type: "string" }, condition: { enum: ["above", "below"] }, targetPrice: { type: "string" } }, ["instrumentId", "condition", "targetPrice"]) } },
    "/alerts/{id}": { delete: op("Delete alert", "Alerts") },
    "/orders": {
      get: { ...op("List own orders (incl. rejected/cancelled)", "Trading"), parameters: [{ name: "status", in: "query" }] },
      post: { ...op("Submit paper order", "Trading"), parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 80 } }],
        requestBody: json({ instrumentId: { type: "string" }, side: { enum: ["buy", "sell"] }, orderType: { enum: ["market", "limit"] }, quantity: { type: "string" }, limitPrice: { type: "string" } }, ["instrumentId", "side", "orderType", "quantity"]) },
    },
    "/orders/{id}": { get: op("Order detail with lifecycle events and executions", "Trading") },
    "/orders/{id}/cancel": { post: op("Cancel an open order", "Trading") },
    "/trades": { get: op("List own executions", "Trading") },
    "/wallet": { get: op("Virtual wallet, append-only ledger and reconciliation", "Wallet") },
    "/portfolio": { get: op("Holdings, valuation, realised/unrealised P&L with freshness", "Portfolio") },
    "/portfolio/history": { get: op("Portfolio snapshots", "Portfolio") },
    "/notifications": { get: op("Own notifications", "Alerts"), post: op("Mark all read", "Alerts") },
    "/learning/categories": { get: op("Learning categories", "Learning") },
    "/learning/content": { get: op("Published content with own progress", "Learning") },
    "/learning/content/{id}": { get: op("Content detail", "Learning") },
    "/learning/content/{id}/progress": { put: { ...op("Record progress (monotonic)", "Learning"), requestBody: json({ progressPct: { type: "number", minimum: 0, maximum: 100 } }, ["progressPct"]) } },
    "/ai/sessions": { get: op("List own AI sessions", "AI"), post: op("Create AI session", "AI") },
    "/ai/sessions/{id}": { get: op("Session messages", "AI"), delete: op("Delete session", "AI") },
    "/ai/sessions/{id}/messages": { post: { ...op("Send message (assistant is read-only)", "AI"), requestBody: json({ text: { type: "string", maxLength: 4000 } }, ["text"]) } },
    "/admin/users": { get: op("Search users [users:manage]", "Admin") },
    "/admin/users/{id}": { patch: op("Change role/status/permissions with reason [users:manage]", "Admin") },
    "/admin/content": { get: op("All learning content [content:manage]", "Admin"), post: op("Create content [content:manage]", "Admin") },
    "/admin/content/{id}": { patch: op("Edit / publish / unpublish / archive [content:manage]", "Admin") },
    "/admin/audit-logs": { get: op("Audit events [audit:read]", "Admin") },
    "/admin/reports": { get: op("Operational summary [reports:read]", "Admin") },
    "/admin/config": { get: op("Platform configuration [config:manage]", "Admin"), put: op("Update configuration with reason [config:manage]", "Admin") },
    "/admin/wallets/{userId}/adjust": { post: op("Compensating virtual-wallet adjustment [finance:adjust]", "Admin") },
    "/health": { get: { ...op("Health check", "Ops"), security: [] } },
  },
};

export function GET() {
  return NextResponse.json(spec);
}
