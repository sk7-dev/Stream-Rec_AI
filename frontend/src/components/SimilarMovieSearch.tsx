import { useMemo, useState } from "react";
import { ApiError, getSimilarMovies } from "../api";
import type { MovieSearchItem, SimilarMoviesResponse } from "../types";
import { MovieAutocomplete } from "./MovieAutocomplete";
import { SimilarityResults } from "./SimilarityResults";

function SelectedMoviePoster({ movie }: { movie: MovieSearchItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="selected-movie-poster">
      {movie.poster_url && !failed ? (
        <img src={movie.poster_url} alt="" width="42" height="63" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{movie.title.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function SimilarMovieSearch() {
  const [selected, setSelected] = useState<MovieSearchItem[]>([]);
  const [data, setData] = useState<SimilarMoviesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedIds = useMemo(() => new Set(selected.map((movie) => movie.movie_id)), [selected]);

  function clearStaleResults() {
    setData(null);
    setError(null);
  }

  function addMovie(movie: MovieSearchItem) {
    if (selectedIds.has(movie.movie_id)) {
      setError("That movie is already selected.");
      return;
    }
    if (selected.length >= 3) {
      setError("You can select up to three movies.");
      return;
    }
    setSelected((current) => [...current, movie]);
    clearStaleResults();
  }

  function removeMovie(movieId: string) {
    setSelected((current) => current.filter((movie) => movie.movie_id !== movieId));
    clearStaleResults();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (selected.length === 0) {
      setError("Select at least one movie.");
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await getSimilarMovies(selected.map((movie) => movie.movie_id)));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "We couldn’t find similar movies. Please try again in a moment.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="workflow-card">
        <div className="workflow-heading">
          <p className="section-kicker">
            Content discovery
            <span className="info-tooltip" tabIndex={0} aria-label="Prototype catalog notice">
              <span className="info-tooltip-glyph" aria-hidden="true">i</span>
              <span className="info-tooltip-bubble" role="tooltip">
                <strong>Prototype catalog.</strong> Similarity search currently operates on a curated,
                limited selection of movies. A production deployment is designed to support a broader,
                continuously refreshed catalog.
              </span>
            </span>
          </p>
          <h3>Start with a movie you love</h3>
          <p>Choose up to three titles and we’ll blend their genres, themes, creators, language, and release characteristics.</p>
        </div>

        <div className="search-submit-row">
          <MovieAutocomplete selectedIds={selectedIds} onSelect={addMovie} disabled={selected.length >= 3} />
          <div className="search-submit-button-wrap">
            <span className="search-submit-spacer" aria-hidden="true">Find movies</span>
            <button type="submit" disabled={selected.length === 0 || loading} className="primary-button search-submit-button">
              {loading && <span className="button-spinner" aria-hidden="true" />}
              <span>{loading ? "Finding matches…" : "Find similar movies"}</span>
            </button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="selected-movies-area" aria-label="Selected movies">
            <div className="selected-movies-heading">
              <p>Selected <span>· {selected.length} of 3</span></p>
            </div>
            <div className="selected-movie-list">
              {selected.map((movie, index) => (
                <div key={movie.movie_id} className="selected-movie-item">
                  <SelectedMoviePoster movie={movie} />
                  <span className="selection-number" aria-label={`Selection ${index + 1}`}>{index + 1}</span>
                  <span className="selected-movie-copy">
                    <strong>{movie.title}</strong>
                    <span>{movie.release_year ?? "Year unavailable"}</span>
                  </span>
                  <button type="button" onClick={() => removeMovie(movie.movie_id)} aria-label={`Remove ${movie.title}`} className="remove-button">
                    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m6 6 8 8m0-8-8 8" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </form>

      <SimilarityResults data={data} loading={loading} error={error} selectedMovies={selected} />
    </>
  );
}
