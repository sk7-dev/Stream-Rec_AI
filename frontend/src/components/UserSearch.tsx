import { useEffect, useRef, useState } from "react";
import { searchUsers } from "../api";
import { useDebounce } from "../hooks/useDebounce";
import type { UserSummary } from "../types";

interface UserSearchProps {
  onSelect: (user: UserSummary) => void;
}

export function UserSearch({ onSelect }: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 250);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    searchUsers(debouncedQuery, 8)
      .then((res) => {
        if (!cancelled) setResults(res.users);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
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

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search by user ID, name, or email…"
        className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm
                   text-neutral-900 placeholder:text-neutral-400 shadow-sm
                   focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30
                   dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
      />

      {isOpen && (query.length > 0 || results.length > 0) && (
        <div
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200
                     bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {loading && (
            <div className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">Searching…</div>
          )}

          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">No users found</div>
          )}

          {!loading &&
            results.map((user) => (
              <button
                key={user.user_id}
                onClick={() => {
                  onSelect(user);
                  setQuery(`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.user_id);
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm
                           hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="flex flex-col">
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {user.first_name} {user.last_name}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{user.user_id}</span>
                </span>
                {user.subscription_plan && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    {user.subscription_plan}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
