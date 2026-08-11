import type {
  HealthResponse,
  MovieSearchResponse,
  RecommendationsResponse,
  SimilarMoviesResponse,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item?.msg).filter(Boolean).join(" ")
          : res.statusText;
    throw new ApiError(res.status, message || "Request failed");
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

export function searchMovies(
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<MovieSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return request<MovieSearchResponse>(`/movies/search?${params.toString()}`, { signal });
}

export function getSimilarMovies(movieIds: string[], limit = 10): Promise<SimilarMoviesResponse> {
  return request<SimilarMoviesResponse>("/recommendations/similar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ movie_ids: movieIds, limit }),
  });
}

export { ApiError };
