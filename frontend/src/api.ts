import type {
  HealthResponse,
  RecommendationsResponse,
  UserSearchResponse,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export function searchUsers(query: string, limit = 20): Promise<UserSearchResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query) params.set("q", query);
  return request<UserSearchResponse>(`/users?${params.toString()}`);
}

export function getRecommendations(userId: string): Promise<RecommendationsResponse> {
  return request<RecommendationsResponse>(`/recommendations/${encodeURIComponent(userId)}`);
}

export { ApiError };
