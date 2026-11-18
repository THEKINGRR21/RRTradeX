export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new ApiError(400, "bad_request", m, d);
export const unauthorized = (m = "Authentication required") => new ApiError(401, "unauthorized", m);
export const forbidden = (m = "You do not have permission to perform this action") => new ApiError(403, "forbidden", m);
export const notFound = (m = "Not found") => new ApiError(404, "not_found", m);
export const conflict = (m: string) => new ApiError(409, "conflict", m);
export const tooMany = (m = "Too many requests, please slow down") => new ApiError(429, "rate_limited", m);
