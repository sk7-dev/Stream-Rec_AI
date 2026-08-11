import { useState } from "react";
import type { Recommendation, SimilarMovieRecommendation } from "../types";
import { gradientFor } from "../lib/genreGradients";

interface MovieCardProps {
  rec: Recommendation | SimilarMovieRecommendation;
}

function validYear(value: number | undefined) {
  return Number.isInteger(value) && value! > 1880 && value! < 2200 ? value : undefined;
}

function Poster({ rec, showPoster, onError }: { rec: Recommendation | SimilarMovieRecommendation; showPoster: boolean; onError: () => void }) {
  return showPoster ? (
    <img
      src={rec.poster_url}
      alt={rec.title ? `${rec.title} poster` : "Movie poster"}
      width="108"
      height="162"
      loading="lazy"
      onError={onError}
      className="movie-card-poster-image"
    />
  ) : (
    <div className={`movie-card-poster-fallback bg-gradient-to-br ${gradientFor(rec.genre_primary)}`}>
      <span>{(rec.title ?? rec.genre_primary ?? "Movie").slice(0, 1)}</span>
    </div>
  );
}

function IMDbRating({ rating }: { rating: number }) {
  return <span className="imdb-rating" aria-label={`IMDb rating ${rating.toFixed(1)}`}><span aria-hidden="true">★</span> {rating.toFixed(1)}</span>;
}

export function MovieCard({ rec }: MovieCardProps) {
  const [posterFailed, setPosterFailed] = useState(false);
  const showPoster = Boolean(rec.poster_url) && !posterFailed;
  const isSimilarity = "similarity_score" in rec;
  const title = rec.title || rec.movie_id;
  const year = validYear(rec.release_year);
  const rating = rec.imdb_rating != null && Number.isFinite(rec.imdb_rating) ? rec.imdb_rating : null;

  if (isSimilarity) {
    const similarityPercent = Math.max(0, Math.min(100, Math.round(rec.similarity_score * 100)));
    const genres = Array.from(new Set([rec.genre_primary, rec.genre_secondary, ...rec.genres].filter(Boolean))).slice(0, 2);
    const metadata = [year, genres.join(", ")].filter(Boolean).join(" · ");
    const primaryReason = rec.match_reasons[0];

    return (
      <article aria-label={`${title}, ranked ${rec.rank}, ${similarityPercent}% match`} className="movie-result-card">
        <div className="movie-card-poster">
          <Poster rec={rec} showPoster={showPoster} onError={() => setPosterFailed(true)} />
        </div>
        <div className="movie-card-content">
          <div className="movie-card-title-row">
            <span className="movie-rank">#{rec.rank}</span>
            <h4>{title}</h4>
            <span className="similarity-score">{similarityPercent}% match</span>
          </div>
          {metadata && <p className="movie-metadata">{metadata}</p>}
          <div className="movie-score-row">
            {rating != null && <IMDbRating rating={rating} />}
          </div>
          <div className="similarity-line" role="progressbar" aria-label={`Match score for ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={similarityPercent}>
            <span style={{ width: `${similarityPercent}%` }} />
          </div>
          {primaryReason && <p className="match-reason">{primaryReason}</p>}
          {rec.match_reasons.length > 1 && (
            <details className="match-details">
              <summary>More match details</summary>
              <ul>{rec.match_reasons.slice(1).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </details>
          )}
        </div>
      </article>
    );
  }

  const metadata = [
    year,
    rec.genre_primary,
    rec.language && rec.language !== "English" ? rec.language : undefined,
  ].filter(Boolean).join(" · ");

  return (
    <article aria-label={`${title}, ranked ${rec.rank}`} className="movie-result-card">
      <div className="movie-card-poster">
        <Poster rec={rec} showPoster={showPoster} onError={() => setPosterFailed(true)} />
      </div>
      <div className="movie-card-content">
        <div className="movie-card-title-row">
          <span className="movie-rank">#{rec.rank}</span>
          <h4>{title}</h4>
          {Number.isFinite(rec.score) && <span className="recommendation-score">Recommended {rec.score.toFixed(2)}</span>}
        </div>
        {metadata && <p className="movie-metadata">{metadata}</p>}
        <div className="movie-score-row">{rating != null && <IMDbRating rating={rating} />}</div>
        {rec.overview && <p className="movie-overview">{rec.overview}</p>}
      </div>
    </article>
  );
}
