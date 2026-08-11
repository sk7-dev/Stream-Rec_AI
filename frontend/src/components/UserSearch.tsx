import { useEffect, useId, useRef, useState } from "react";
import { searchUsers } from "../api";
import { useDebounce } from "../hooks/useDebounce";
import type { UserSummary } from "../types";

interface UserSearchProps {
  onSelect: (user: UserSummary) => void;
}

function displayName(user: UserSummary) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.user_id;
}

export function UserSearch({ onSelect }: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebounce(query, 250);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listboxId = `${inputId}-results`;

  useEffect(() => {
    const normalized = debouncedQuery.trim();
    if (!normalized) {
      setResults([]);
      setLoading(false);
      setSearchError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSearchError(false);
    searchUsers(normalized, 8)
      .then((response) => {
        if (cancelled) return;
        setResults(response.users);
        setActiveIndex(-1);
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setSearchError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function choose(user: UserSummary) {
    setQuery(displayName(user));
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(user);
  }

  function clear() {
    setQuery("");
    setResults([]);
    setSearchError(false);
    setActiveIndex(-1);
    setIsOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!isOpen || results.length === 0) {
      if (event.key === "ArrowDown") setIsOpen(true);
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

  const showPanel = isOpen && query.trim().length > 0;

  return (
    <div ref={containerRef} className="search-control">
      <label htmlFor={inputId}>Find a viewer</label>
      <div className="search-field-wrap">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="search-icon">
          <circle cx="8.5" cy="8.5" r="5" />
          <path d="m12.2 12.2 4 4" />
        </svg>
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, email, or user ID"
          className="search-input"
        />
        {loading && <span className="input-spinner" aria-hidden="true" />}
        {!loading && query && (
          <button type="button" className="clear-input-button" onClick={clear} aria-label="Clear viewer search">
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m6 6 8 8m0-8-8 8" /></svg>
          </button>
        )}
      </div>

      {showPanel && (
        <div id={listboxId} role="listbox" className="search-results-panel">
          {loading && (
            <div className="autocomplete-skeleton" aria-label="Searching viewers">
              {[0, 1, 2].map((item) => <span key={item}><i /><b /></span>)}
            </div>
          )}
          {!loading && searchError && <p className="search-message search-error">Viewer search is unavailable. Please try again.</p>}
          {!loading && !searchError && results.length === 0 && <p className="search-message">No users found.</p>}
          {!loading && !searchError && results.map((user, index) => (
            <button
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              key={user.user_id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(user)}
              className={`autocomplete-option ${index === activeIndex ? "is-active" : ""}`}
            >
              <span className="autocomplete-avatar">{(user.first_name?.[0] ?? user.user_id[0] ?? "U").toUpperCase()}</span>
              <span className="autocomplete-copy">
                <strong>{displayName(user)}</strong>
                <span>{[user.email, user.user_id].filter(Boolean).join(" · ")}</span>
              </span>
              {user.subscription_plan && <span className="autocomplete-meta">{user.subscription_plan}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        {loading ? "Searching viewers" : `${results.length} viewer results available`}
      </div>
    </div>
  );
}
