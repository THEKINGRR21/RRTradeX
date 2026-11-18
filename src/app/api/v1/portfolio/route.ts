import { api } from "@/lib/api";
import { getPortfolio } from "@/lib/portfolio";
import { TRADING_ROLES } from "@/lib/auth";

export const GET = api({ roles: TRADING_ROLES }, async ({ user }) => getPortfolio(user.userId));
