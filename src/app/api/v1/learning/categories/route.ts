import { api } from "@/lib/api";
import { q } from "@/lib/db";
export const GET = api({}, async () => ({ categories: await q(`SELECT category_id AS id, name FROM learning_categories ORDER BY sort_order, name`) }));
