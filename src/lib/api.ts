import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ApiError, forbidden, tooMany, badRequest } from "./errors";
import { assertPermission, assertRole, getCurrentUser, type CurrentUser, type Permission, type Role } from "./auth";
import { rateLimit } from "./ratelimit";

export interface Ctx<P = Record<string, string>> {
  req: NextRequest; params: P; user: CurrentUser; requestId: string; ip: string | null;
}
type Opts = { auth?: "public" | "user"; roles?: Role[]; permission?: Permission; rate?: [limit: number, windowMs: number] };

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;

function log(level: "info" | "error", data: Record<string, unknown>) {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), svc: "rrtradex-api", ...data });
  level === "error" ? console.error(line) : console.log(line);
}

/** Wraps a route handler: correlation id, auth/RBAC, CSRF origin check, rate limit, uniform errors. */
export function api<P = Record<string, string>>(opts: Opts, fn: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
    const started = Date.now();
    const ip = clientIp(req);
    let status = 200;
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
        if (origin && host && new URL(origin).host !== host) throw forbidden("Cross-origin request rejected");
      }
      const [limit, win] = opts.rate ?? (req.method === "GET" ? [240, 60_000] : [60, 60_000]);
      if (!rateLimit(`${ip}:${req.method}:${req.nextUrl.pathname.replace(/[0-9a-f-]{36}/g, ":id")}`, limit, win)) throw tooMany();

      let user: CurrentUser = null as any;
      if (opts.auth !== "public") {
        user = assertRole(await getCurrentUser(), opts.roles);
        if (opts.permission) assertPermission(user, opts.permission);
      }
      const params = (await route?.params) ?? ({} as P);
      const out = await fn({ req, params, user, requestId, ip });
      if (out instanceof NextResponse) { status = out.status; out.headers.set("x-request-id", requestId); return out; }
      const res = NextResponse.json(out ?? { ok: true });
      res.headers.set("x-request-id", requestId);
      res.headers.set("cache-control", "no-store");
      return res;
    } catch (e: any) {
      let err: ApiError;
      if (e instanceof ApiError) err = e;
      else if (e instanceof ZodError) err = new ApiError(400, "validation_error", "Request validation failed", e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      else if (e?.code === "23505") err = new ApiError(409, "conflict", "A record with these details already exists");
      else if (e?.code === "23514" || e?.code === "22P02") err = new ApiError(400, "bad_request", "Invalid value");
      else {
        err = new ApiError(500, "internal_error", "Something went wrong. Please try again.");
        log("error", { requestId, path: req.nextUrl.pathname, method: req.method, error: String(e?.message ?? e), stack: e?.stack?.split("\n").slice(0, 4).join(" | ") });
      }
      status = err.status;
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details, requestId } },
        { status: err.status, headers: { "x-request-id": requestId, "cache-control": "no-store" } }
      );
    } finally {
      log("info", { requestId, method: req.method, path: req.nextUrl.pathname, status, ms: Date.now() - started });
    }
  };
}

export async function body<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try { json = await req.json(); } catch { throw badRequest("Request body must be valid JSON"); }
  return schema.parse(json);
}

export const created = <T extends object>(o: T) => NextResponse.json(o, { status: 201 });
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
