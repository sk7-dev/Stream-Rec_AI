import { MovieCard } from "./MovieCard";
import type { RecommendationsResponse } from "../types";

interface RecommendationsGridProps {
  data: RecommendationsResponse | null;
  loading: boolean;
  error: string | null;
  viewerName: string;
}

function ResultSkeleton({ label }: { label: string }) {
  return (
    <div aria-label={label} className="result-card-grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="result-skeleton">
          <span className="skeleton-poster" />
          <span className="skeleton-copy"><i /><i /><i /></span>
        </div>
      ))}
    </div>
  );
}

export function RecommendationsGrid({ data, loading, error, viewerName }: RecommendationsGridProps) {
  if (loading) return <ResultSkeleton label="Loading personalized recommendations" />;

  if (error) {
    return (
      <div role="alert" className="error-state">
        <span className="state-icon" aria-hidden="true">!</span>
        <span><strong>We couldn’t load recommendations.</strong><small>{error}</small></span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="compact-empty-state">
        <span className="state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 5.5h14v13H5zM5 9h14M9 5.5v13"/><path d="m13 12 3 1.75-3 1.75V12Z" /></svg>
        </span>
        <span><strong>Your recommendations will appear here.</strong><small>Search for a viewer to begin.</small></span>
      </div>
    );
  }

  if (data.recommendations.length === 0) {
    return (
      <div className="compact-empty-state">
        <span className="state-icon" aria-hidden="true">0</span>
        <span><strong>No recommendations yet.</strong><small>Try another viewer or check back after more activity.</small></span>
      </div>
    );
  }

  return (
    <section className="results-section" aria-labelledby="personalized-results-heading">
      <header className="results-header">
        <div>
          <p className="section-kicker">Personalized selection</p>
          <h3 id="personalized-results-heading">Picked for {viewerName || data.user_id}</h3>
          <p aria-live="polite">{data.recommendations.length} personalized recommendations</p>
        </div>
        <span className={`source-pill ${data.source === "redis_live" ? "is-live" : ""}`}>
          <span className="source-dot" />
          {data.source === "redis_live" ? "Live recommendations" : "Collaborative filtering"}
        </span>
      </header>
      <div className="result-card-grid">
        {data.recommendations.map((rec) => <MovieCard key={rec.movie_id} rec={rec} />)}
      </div>
    </section>
  );
}
