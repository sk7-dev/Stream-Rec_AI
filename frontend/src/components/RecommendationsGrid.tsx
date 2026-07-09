import { MovieCard } from "./MovieCard";
import type { RecommendationsResponse } from "../types";

interface RecommendationsGridProps {
  data: RecommendationsResponse | null;
  loading: boolean;
  error: string | null;
}

export function RecommendationsGrid({ data, loading, error }: RecommendationsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        Search for a user above to see their recommendations.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Showing <span className="font-medium text-neutral-900 dark:text-neutral-100">{data.recommendations.length}</span>{" "}
          recommendations for <span className="font-medium text-neutral-900 dark:text-neutral-100">{data.user_id}</span>
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            data.source === "redis_live"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300"
          }`}
        >
          {data.source === "redis_live" ? "Live from Redis" : "Offline CF fallback"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {data.recommendations.map((rec) => (
          <MovieCard key={rec.movie_id} rec={rec} />
        ))}
      </div>
    </div>
  );
}
