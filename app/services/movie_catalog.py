"""Helpers for searching and presenting the local movie catalog."""

from typing import Any, Dict, Iterable, List, Mapping


MovieMetadata = Mapping[str, Any]
MovieCatalog = Mapping[str, MovieMetadata]


def movie_genres(metadata: MovieMetadata) -> List[str]:
    """Return deduplicated, non-empty genres in display order."""
    genres: List[str] = []
    for key in ("genre_primary", "genre_secondary"):
        value = str(metadata.get(key, "")).strip()
        if value and value.casefold() != "nan" and value not in genres:
            genres.append(value)
    return genres


def optional_int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError, OverflowError):
        return None


def movie_summary(movie_id: str, metadata: MovieMetadata) -> Dict[str, Any]:
    return {
        "movie_id": movie_id,
        "title": str(metadata.get("title", movie_id)),
        "release_year": optional_int(metadata.get("release_year")),
        "poster_url": metadata.get("poster_url"),
        "genres": movie_genres(metadata),
    }


def search_movie_catalog(
    catalog: MovieCatalog,
    query: str,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Search titles with exact, prefix, word-prefix, then substring priority."""
    normalized_query = query.strip().casefold()
    if len(normalized_query) < 2:
        return []

    matches: List[tuple[int, int, str, str, MovieMetadata]] = []
    for movie_id, metadata in catalog.items():
        title = str(metadata.get("title", "")).strip()
        normalized_title = title.casefold()
        if not normalized_title:
            continue

        if normalized_title == normalized_query:
            priority = 0
        elif normalized_title.startswith(normalized_query):
            priority = 1
        elif any(word.startswith(normalized_query) for word in normalized_title.split()):
            priority = 2
        elif normalized_query in normalized_title:
            priority = 3
        else:
            continue

        matches.append((priority, len(title), normalized_title, movie_id, metadata))

    matches.sort(key=lambda item: (item[0], item[1], item[2], item[3]))
    return [movie_summary(movie_id, metadata) for _, _, _, movie_id, metadata in matches[:limit]]


def summaries_for_ids(movie_ids: Iterable[str], catalog: MovieCatalog) -> List[Dict[str, Any]]:
    return [movie_summary(movie_id, catalog[movie_id]) for movie_id in movie_ids]
