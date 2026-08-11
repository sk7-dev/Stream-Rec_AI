import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { SAMPLE_POSTER_ROWS } from "../data/samplePosterUrls";

const ROW_SETTINGS = [
  { duration: 76, offset: 0 },
  { duration: 58, offset: 5 },
  { duration: 88, offset: 9 },
  { duration: 64, offset: 2 },
  { duration: 81, offset: 7 },
  { duration: 69, offset: 11 },
] as const;
const MIN_POSTERS_PER_ROW = 24;

interface InfinitePosterBackgroundProps {
  posterRows?: readonly (readonly string[])[];
  className?: string;
}

function fillRow(posters: readonly string[], offset = 0) {
  if (posters.length === 0) return [];

  return Array.from(
    { length: Math.max(MIN_POSTERS_PER_ROW, posters.length) },
    (_, index) => posters[(index + offset) % posters.length],
  );
}

function PosterCard({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="poster-background-card relative shrink-0 overflow-hidden rounded-md bg-neutral-800 shadow-lg shadow-black/60">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#52525b,#18181b_55%,#09090b)]" />
      {!failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`relative h-full w-full object-cover transition-opacity duration-700 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

function PosterGroup({ posters, copy }: { posters: readonly string[]; copy: number }) {
  return (
    <div className="poster-background-group" aria-hidden="true">
      {posters.map((poster, index) => (
        <PosterCard key={`${copy}-${index}-${poster}`} src={poster} />
      ))}
    </div>
  );
}

export function InfinitePosterBackground({
  posterRows = SAMPLE_POSTER_ROWS,
  className = "",
}: InfinitePosterBackgroundProps) {
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );

  useEffect(() => {
    const handleVisibilityChange = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const rows = useMemo(() => {
    if (posterRows.length === 0) return [];

    return ROW_SETTINGS.map(({ offset }, index) =>
      fillRow(posterRows[index % posterRows.length] ?? [], offset),
    );
  }, [posterRows]);

  if (!rows.some((row) => row.length > 0)) return null;

  return (
    <div
      className={`poster-background-root pointer-events-none fixed inset-0 overflow-hidden bg-[#050505] ${className}`}
      aria-hidden="true"
    >
      <div
        className={`poster-background-grid absolute left-1/2 top-1/2 ${
          pageVisible ? "" : "poster-background-paused"
        }`}
      >
        {rows.map((row, index) => {
          if (row.length === 0) return null;

          const { duration } = ROW_SETTINGS[index];

          return (
            <div className="poster-background-row" key={`${duration}-${index}`}>
              <div
                className={`poster-background-track ${index % 2 ? "poster-background-track-reverse" : ""}`}
                style={{
                  "--poster-duration": `${duration}s`,
                  "--poster-delay": `${-duration * (0.08 + index * 0.035)}s`,
                } as CSSProperties}
              >
                {/* Two equal groups make translateX(-50%) a perfectly seamless handoff. */}
                <PosterGroup posters={row} copy={0} />
                <PosterGroup posters={row} copy={1} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-0 bg-black/20" />
      <div className="poster-background-center absolute inset-0" />
      <div className="poster-background-vignette absolute inset-0" />
    </div>
  );
}
