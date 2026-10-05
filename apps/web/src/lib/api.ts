import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { presentationMode } from "./deployment";
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [twoFactorClient()],
});
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  if (presentationMode) {
    if (url === "/config")
      return {
        googleAuth: false,
        googlePlaces: false,
        maps: false,
        menus: false,
        transit: false,
        payments: false,
        localMailbox: false,
        monthlyPrice: 5,
        annualPrice: 40,
        freeMenus: 10,
        proMenus: 30,
        freeOnly: false,
      } as T;
    throw new ApiError(
      "This presentation uses the example trip. Account and live services are available in the connected app.",
      401,
    );
  }
  const res = await fetch(`/api/v1${url}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const body = await res
    .json()
    .catch(() => ({ error: "The server could not be reached." }));
  if (!res.ok)
    throw new ApiError(
      body.error || "This action could not be completed.",
      res.status,
      body.code,
    );
  return body;
}
export const post = <T = any>(url: string, body: unknown) =>
  api<T>(url, { method: "POST", body: JSON.stringify(body) });
export interface Features {
  googleAuth: boolean;
  googlePlaces: boolean;
  maps: boolean;
  menus: boolean;
  transit: boolean;
  payments: boolean;
  localMailbox: boolean;
  monthlyPrice: number;
  annualPrice: number;
  freeMenus: number;
  proMenus: number;
  freeOnly: boolean;
}
