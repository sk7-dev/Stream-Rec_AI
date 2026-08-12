import { useEffect, useId, useRef, useState } from "react";
import { searchMovies } from "../api";
import { useDebounce } from "../hooks/useDebounce";
import type { MovieSearchItem } from "../types";

interface MovieAutocompleteProps {
  selectedIds: ReadonlySet<string>;
  onSelect: (movie: MovieSearchItem) => void;
  disabled?: boolean;
  compact?: boolean;
}

function PosterThumbnail({ movie }: { movie: MovieSearchItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="autocomplete-poster">
      {movie.poster_url && !failed ? (
        <img src={movie.poster_url} alt="" width="44" height="66" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{movie.title.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function MovieAutocomplete({ selectedIds, onSelect, disabled = false, compact = false }: MovieAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebounce(query, 250);
  const listboxId = useId();
  const inputId = `${listboxId}-input`;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const normalized = debouncedQuery.trim();
    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchMovies(normalized, 8, controller.signal)
      .then((response) => {
        setResults(response.results.filter((movie) => !selectedIds.has(movie.movie_id)));
        setActiveIndex(-1);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setResults([]);
        setError("Movie search is unavailable. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, selectedIds]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function choose(movie: MovieSearchItem) {
    onSelect(movie);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function clear() {
    setQuery("");
    setResults([]);
    setError(null);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || results.length === 0) {
      if (event.key === "ArrowDown") setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  }

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className={`search-control ${compact ? "search-control--compact" : ""}`}>
      {!compact && <label htmlFor={inputId}>Find movies</label>}
      <div className="search-field-wrap">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="search-icon"><circle cx="8.5" cy="8.5" r="5" /><path d="m12.2 12.2 4 4" /></svg>
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-label="Search the movie catalog"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          disabled={disabled}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Three movies selected" : "Search the movie catalog"}
          className="search-input"
        />
        {loading && <span className="input-spinner" aria-hidden="true" />}
        {!loading && query && <button type="button" className="clear-input-button" onClick={clear} aria-label="Clear movie search"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m6 6 8 8m0-8-8 8" /></svg></button>}
      </div>
      {disabled && <p className="input-helper">Remove a selected movie to search again.</p>}

      {showPanel && (
        <div id={listboxId} role="listbox" className={`search-results-panel ${compact ? "search-results-panel--compact" : ""}`}>
          {loading && <div className="autocomplete-skeleton" aria-label="Searching movies">{[0, 1, 2].map((item) => <span key={item}><i /><b /></span>)}</div>}
          {!loading && error && <p className="search-message search-error">{error}</p>}
          {!loading && !error && results.length === 0 && <p className="search-message">No matching movies found.</p>}
          {!loading && !error && results.map((movie, index) => (
            <button
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
              key={movie.movie_id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(movie)}
              className={`autocomplete-option ${compact ? "autocomplete-option--compact" : ""} ${index === activeIndex ? "is-active" : ""}`}
            >
              <PosterThumbnail movie={movie} />
              <span className="autocomplete-copy">
                <strong>{movie.title}</strong>
                <span>{compact ? (movie.release_year ?? "") : [movie.release_year, movie.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="sr-only" aria-live="polite">{loading ? "Searching movies" : `${results.length} movie results available`}</div>
    </div>
  );
}
