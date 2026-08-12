import { useState } from "react";
import type { Recommendation, SimilarMovieRecommendation } from "../types";
import { gradientFor } from "../lib/genreGradients";

interface MovieCardProps {
  rec: Recommendation | SimilarMovieRecommendation;
  matchPercent?: number;
}

function validYear(value: number | undefined) {
  return Number.isInteger(value) && value! > 1880 && value! < 2200 ? value : undefined;
}

function Poster({ rec, showPoster, onError }: { rec: Recommendation | SimilarMovieRecommendation; showPoster: boolean; onError: () => void }) {
  return showPoster ? (
    <img
      src={rec.poster_url}
      alt=""
      loading="lazy"
      onError={onError}
      className="movie-card-poster-image"
    />
  ) : (
    <div className={`movie-card-poster-fallback bg-gradient-to-br ${gradientFor(rec.genre_primary)}`}>
      <span aria-hidden="true">{(rec.title ?? rec.genre_primary ?? "Movie").slice(0, 1)}</span>
    </div>
  );
}

function DetailsBackdrop({ rec, showPoster }: { rec: Recommendation | SimilarMovieRecommendation; showPoster: boolean }) {
  return showPoster ? (
    <div className="movie-card-details-bg" style={{ backgroundImage: `url(${rec.poster_url})` }} aria-hidden="true" />
  ) : (
    <div className={`movie-card-details-bg bg-gradient-to-br ${gradientFor(rec.genre_primary)}`} aria-hidden="true" />
  );
}

function IMDbRating({ rating }: { rating: number }) {
  return <span className="imdb-rating"><span aria-hidden="true">★</span> {rating.toFixed(1)}</span>;
}

function matchReasonLabel(reason: string) {
  const separatorIndex = reason.indexOf(":");
  if (separatorIndex === -1) {
    return /release period/i.test(reason) ? "Similar era" : reason;
  }
  return reason.slice(0, separatorIndex).trim();
}

function personalizedTags(rec: Recommendation) {
  const tags = [rec.genre_primary, rec.genre_secondary, rec.director, rec.language].filter(
    (value, index, all) => Boolean(value) && all.indexOf(value) === index,
  ) as string[];
  return tags.slice(0, 3);
}

export function MovieCard({ rec, matchPercent: matchPercentOverride }: MovieCardProps) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const showPoster = Boolean(rec.poster_url) && !posterFailed;
  const isSimilarity = "similarity_score" in rec;
  const title = rec.title || rec.movie_id;
  const year = validYear(rec.release_year);
  const rating = rec.imdb_rating != null && Number.isFinite(rec.imdb_rating) ? rec.imdb_rating : null;

  const matchPercent = isSimilarity
    ? Math.max(0, Math.min(100, Math.round(rec.similarity_score * 100)))
    : matchPercentOverride ?? null;
  const genre = isSimilarity
    ? Array.from(new Set([rec.genre_primary, rec.genre_secondary, ...rec.genres].filter(Boolean)))[0]
    : rec.genre_primary;
  const metadata = [year, genre].filter(Boolean).join(" · ");
  const matchReasons = isSimilarity ? rec.match_reasons : [];
  const infoTags = isSimilarity ? [] : personalizedTags(rec);

  function toggle() {
    setExpanded((value) => !value);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    } else if (event.key === "Escape") {
      setExpanded(false);
    }
  }

  return (
    <article className="movie-result-card">
      <div
        className={`movie-card-poster-wrap ${expanded ? "is-expanded" : ""}`}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? `Hide details for ${title}` : `Show details for ${title}`}
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <div className="movie-card-flip">
          <div className="movie-card-face">
            <Poster rec={rec} showPoster={showPoster} onError={() => setPosterFailed(true)} />
            <div className="movie-card-poster-scrim" aria-hidden="true" />

            <div className="movie-card-caption" aria-hidden="true">
              <h4>{title}</h4>
              <div className="movie-card-caption-meta">
                {metadata && <span>{metadata}</span>}
                {rating != null && <IMDbRating rating={rating} />}
              </div>
            </div>
          </div>

          <div className="movie-card-details" aria-hidden={!expanded}>
            <DetailsBackdrop rec={rec} showPoster={showPoster} />
            <div className="movie-card-details-tint" aria-hidden="true" />
            <div className="movie-card-details-inner">
              <h4>{title}</h4>
              <div className="movie-card-details-meta">
                {metadata && <span>{metadata}</span>}
                {rating != null && <IMDbRating rating={rating} />}
              </div>

              {matchPercent != null && (
                <div className="movie-card-details-score">
                  <div className="movie-card-details-score-row">
                    <span className="movie-card-details-score-value">{matchPercent}%</span>
                    <span className="movie-card-details-score-label">match</span>
                  </div>
                  <div className="movie-card-details-score-bar">
                    <div className="movie-card-details-score-fill" style={{ width: `${matchPercent}%` }} />
                  </div>
                </div>
              )}

              {isSimilarity ? (
                matchReasons.length > 0 ? (
                  <ul className="match-reason-pills">
                    {matchReasons.map((reason) => (
                      <li key={reason} className="match-reason-pill" title={reason}>
                        {matchReasonLabel(reason)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="movie-card-details-empty">No match details available.</p>
                )
              ) : infoTags.length > 0 ? (
                <ul className="match-reason-pills">
                  {infoTags.map((tag) => (
                    <li key={tag} className="match-reason-pill">
                      {tag}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="movie-card-details-overview">{rec.overview || "No overview available."}</p>
              )}
            </div>
          </div>
        </div>

        <div className="movie-card-top-row" aria-hidden="true">
          <span className="movie-rank">#{rec.rank}</span>
          {matchPercent != null && <span className="similarity-score">{matchPercent}%</span>}
        </div>
      </div>
    </article>
  );
}
