"use client";
import { useApi } from "./client";
export type Me = {
  user: { id: string; email: string; role: "retail" | "trader" | "admin"; status: string; kycStatus: string; permissions: string[]; createdAt: string; lastLoginAt: string | null;
    profile: { fullName: string; phone: string | null; riskProfile: string; experienceLevel: string } };
  canTrade: boolean; limits: any; unreadNotifications: number;
};
export const useMe = () => useApi<Me>("/me");
