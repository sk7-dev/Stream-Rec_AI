import { useState } from "react";
import type { Recommendation } from "../types";

const GENRE_GRADIENTS: Record<string, string> = {
  action: "from-orange-500 to-red-600",
  comedy: "from-amber-400 to-pink-500",
  drama: "from-indigo-500 to-purple-600",
  thriller: "from-slate-700 to-slate-900",
  "sci-fi": "from-cyan-500 to-blue-700",
  horror: "from-red-900 to-neutral-900",
  romance: "from-pink-400 to-rose-600",
  documentary: "from-teal-500 to-emerald-700",
  animation: "from-sky-400 to-indigo-500",
  biography: "from-yellow-600 to-orange-700",
  war: "from-stone-600 to-neutral-800",
  adventure: "from-lime-500 to-green-700",
  fantasy: "from-fuchsia-500 to-violet-700",
  crime: "from-zinc-700 to-black",
  mystery: "from-purple-800 to-neutral-900",
  music: "from-pink-500 to-purple-600",
  "film-noir": "from-neutral-700 to-black",
  western: "from-amber-700 to-orange-900",
  family: "from-teal-400 to-cyan-600",
};

const DEFAULT_GRADIENT = "from-neutral-500 to-neutral-700";

function gradientFor(genre?: string): string {
  if (!genre) return DEFAULT_GRADIENT;
  return GENRE_GRADIENTS[genre.toLowerCase()] ?? DEFAULT_GRADIENT;
}

function sourceBadge(source: string): { label: string; className: string } {
  if (source.startsWith("live") || source === "redis_live") {
    return {
      label: "Live",
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    };
  }
  return {
    label: "Offline CF",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300",
  };
}

interface MovieCardProps {
  rec: Recommendation;
}

export function MovieCard({ rec }: MovieCardProps) {
  const badge = sourceBadge(rec.source);
  const [posterFailed, setPosterFailed] = useState(false);
  const showPoster = Boolean(rec.poster_url) && !posterFailed;

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        {showPoster ? (
          <img
            src={rec.poster_url}
            alt={rec.title ? `${rec.title} poster` : "Movie poster"}
            loading="lazy"
            onError={() => setPosterFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradientFor(rec.genre_primary)}`}
          >
            <span className="px-4 text-center text-sm font-semibold uppercase tracking-wide text-white/90">
              {rec.genre_primary ?? "Unknown genre"}
            </span>
          </div>
        )}

        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
          #{rec.rank}
        </span>
        {rec.imdb_rating != null && (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
            ★ {rec.imdb_rating.toFixed(1)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {rec.title ?? rec.movie_id}
        </h3>

        <div className="flex flex-wrap gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          {rec.release_year && <span>{rec.release_year}</span>}
          {rec.genre_primary && (
            <>
              <span>·</span>
              <span>{rec.genre_primary}</span>
            </>
          )}
          {rec.language && rec.language !== "English" && (
            <>
              <span>·</span>
              <span>{rec.language}</span>
            </>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            score {rec.score.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
