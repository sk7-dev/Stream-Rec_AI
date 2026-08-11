import type { MovieSearchItem, SimilarMoviesResponse } from "../types";
import { MovieCard } from "./MovieCard";

interface SimilarityResultsProps {
  data: SimilarMoviesResponse | null;
  loading: boolean;
  error: string | null;
  selectedMovies: MovieSearchItem[];
}

function resultTitle(movies: MovieSearchItem[]) {
  if (movies.length === 0) return "Similar movies";
  const titles = movies.map((movie) => movie.title);
  if (titles.length === 1) return `Movies similar to ${titles[0]}`;
  if (titles.length === 2) return `Movies similar to ${titles[0]} and ${titles[1]}`;
  return `Movies similar to ${titles[0]}, ${titles[1]}, and ${titles[2]}`;
}

export function SimilarityResults({ data, loading, error, selectedMovies }: SimilarityResultsProps) {
  if (loading) {
    return (
      <div aria-label="Finding similar movies" className="result-card-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="result-skeleton">
            <span className="skeleton-poster" />
            <span className="skeleton-copy"><i /><i /><i /></span>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="error-state">
        <span className="state-icon" aria-hidden="true">!</span>
        <span><strong>We couldn’t find movie matches.</strong><small>{error}</small></span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="compact-empty-state">
        <span className="state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="5.5"/><path d="m14 14 4.5 4.5M17 4v4M15 6h4" /></svg>
        </span>
        <span><strong>Your movie matches will appear here.</strong><small>Choose up to three movies to discover related titles.</small></span>
      </div>
    );
  }

  if (data.recommendations.length === 0) {
    return (
      <div className="compact-empty-state">
        <span className="state-icon" aria-hidden="true">0</span>
        <span><strong>No matching movies were found.</strong><small>Try a different title or combination.</small></span>
      </div>
    );
  }

  return (
    <section className="results-section" aria-labelledby="similar-results-heading">
      <header className="results-header">
        <div>
          <p className="section-kicker">Content matches</p>
          <h3 id="similar-results-heading" title={resultTitle(data.seed_movies.length ? data.seed_movies : selectedMovies)}>{resultTitle(data.seed_movies.length ? data.seed_movies : selectedMovies)}</h3>
          <p aria-live="polite">{data.recommendations.length} content matches</p>
        </div>
        <span className="source-pill"><span className="source-dot is-cyan" />Offline content model</span>
      </header>
      <div className="result-card-grid">
        {data.recommendations.map((movie) => <MovieCard key={movie.movie_id} rec={movie} />)}
      </div>
    </section>
  );
}
