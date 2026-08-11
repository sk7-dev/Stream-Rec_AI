"""Load and query the trusted, locally built content-similarity index."""

from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Mapping, Sequence

import numpy as np
from scipy import sparse
from sklearn.preprocessing import normalize

from app.services.movie_catalog import movie_genres, optional_int


class ContentSimilarityUnavailable(RuntimeError):
    """Raised when the local content-similarity artifact cannot be used."""


class ContentSimilarityIndex:
    """In-memory sparse feature index loaded once per backend process."""

    def __init__(self) -> None:
        self.features: sparse.csr_matrix | None = None
        self.movie_ids: List[str] = []
        self.id_to_row: Dict[str, int] = {}
        self.artifact_metadata: Dict[str, Any] = {}
        self.load_error: str | None = None

    @property
    def available(self) -> bool:
        return self.features is not None and bool(self.movie_ids)

    def clear(self, error: str | None = None) -> None:
        self.features = None
        self.movie_ids = []
        self.id_to_row = {}
        self.artifact_metadata = {}
        self.load_error = error

    def load(
        self,
        features_path: Path,
        metadata_path: Path,
        catalog_ids: Sequence[str],
    ) -> None:
        """Load safe JSON/NPZ artifacts and validate them against the catalog."""
        try:
            if not features_path.exists() or not metadata_path.exists():
                raise ContentSimilarityUnavailable(
                    "Content-similarity artifacts are missing. Run "
                    "`python models/build_content_similarity.py`."
                )

            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            movie_ids = [str(movie_id) for movie_id in metadata.get("movie_ids", [])]
            features = sparse.load_npz(features_path).tocsr().astype(np.float32)

            if not movie_ids or features.shape[0] != len(movie_ids):
                raise ContentSimilarityUnavailable(
                    "Content-similarity artifact rows do not match its movie ID mapping."
                )
            if len(movie_ids) != len(set(movie_ids)):
                raise ContentSimilarityUnavailable("Content-similarity artifact has duplicate movie IDs.")
            if set(movie_ids) != {str(movie_id) for movie_id in catalog_ids}:
                raise ContentSimilarityUnavailable(
                    "Content-similarity artifacts do not match movies.csv. Rebuild the artifacts."
                )
            if not np.isfinite(features.data).all():
                raise ContentSimilarityUnavailable("Content-similarity artifact contains invalid values.")

            self.features = normalize(features, norm="l2", axis=1, copy=False).tocsr()
            self.movie_ids = movie_ids
            self.id_to_row = {movie_id: index for index, movie_id in enumerate(movie_ids)}
            self.artifact_metadata = metadata
            self.load_error = None
        except ContentSimilarityUnavailable as exc:
            self.clear(str(exc))
            raise
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            message = f"Could not load content-similarity artifacts: {exc}"
            self.clear(message)
            raise ContentSimilarityUnavailable(message) from exc

    def recommend(
        self,
        seed_movie_ids: Sequence[str],
        limit: int,
        catalog: Mapping[str, Mapping[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Score and lightly diversify candidates for one to three seed movies."""
        if not self.available or self.features is None:
            raise ContentSimilarityUnavailable(
                self.load_error or "The offline content-similarity model is unavailable."
            )

        seed_rows = [self.id_to_row[movie_id] for movie_id in seed_movie_ids]
        seed_features = self.features[seed_rows]
        blended = normalize(sparse.csr_matrix(seed_features.mean(axis=0)), norm="l2", axis=1)

        blended_similarity = (self.features @ blended.T).toarray().ravel()
        per_seed_similarity = (self.features @ seed_features.T).toarray()
        average_similarity = per_seed_similarity.mean(axis=1)
        minimum_similarity = per_seed_similarity.min(axis=1)

        # The consistency terms keep a multi-seed result from matching only one seed.
        scores = (
            0.70 * blended_similarity
            + 0.25 * average_similarity
            + 0.05 * minimum_similarity
        )
        scores = np.nan_to_num(scores, nan=0.0, posinf=1.0, neginf=0.0)
        scores = np.clip(scores, 0.0, 1.0)

        excluded = set(seed_movie_ids)
        candidates = [
            (self.movie_ids[index], float(scores[index]))
            for index in range(len(self.movie_ids))
            if self.movie_ids[index] not in excluded and self.movie_ids[index] in catalog
        ]
        candidates.sort(
            key=lambda item: (
                -item[1],
                -self._safe_rating(catalog[item[0]].get("imdb_rating")),
                item[0],
            )
        )

        selected = self._diversify(candidates, catalog, limit)
        return [
            self._format_recommendation(rank, movie_id, score, seed_movie_ids, catalog)
            for rank, (movie_id, score) in enumerate(selected, start=1)
        ]

    @staticmethod
    def _safe_rating(value: Any) -> float:
        try:
            rating = float(value)
            return rating if math.isfinite(rating) else 0.0
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _diversify(
        candidates: Sequence[tuple[str, float]],
        catalog: Mapping[str, Mapping[str, Any]],
        limit: int,
    ) -> List[tuple[str, float]]:
        selected: List[tuple[str, float]] = []
        deferred: List[tuple[str, float]] = []
        primary_counts: Counter[str] = Counter()
        per_genre_cap = max(3, math.ceil(limit * 0.4))

        for candidate in candidates:
            primary = str(catalog[candidate[0]].get("genre_primary", "")).strip().casefold()
            if primary and primary_counts[primary] >= per_genre_cap:
                deferred.append(candidate)
                continue
            selected.append(candidate)
            if primary:
                primary_counts[primary] += 1
            if len(selected) >= limit:
                return selected

        for candidate in deferred:
            selected.append(candidate)
            if len(selected) >= limit:
                break
        return selected

    def _format_recommendation(
        self,
        rank: int,
        movie_id: str,
        score: float,
        seed_movie_ids: Sequence[str],
        catalog: Mapping[str, Mapping[str, Any]],
    ) -> Dict[str, Any]:
        metadata = catalog[movie_id]
        genres = movie_genres(metadata)
        rating = self._safe_rating(metadata.get("imdb_rating"))
        return {
            "movie_id": movie_id,
            "title": str(metadata.get("title", movie_id)),
            "poster_url": metadata.get("poster_url"),
            "genres": genres,
            "genre_primary": metadata.get("genre_primary"),
            "genre_secondary": metadata.get("genre_secondary"),
            "release_year": optional_int(metadata.get("release_year")),
            "language": metadata.get("language"),
            "imdb_rating": rating or None,
            "similarity_score": round(score, 6),
            "match_reasons": self._match_reasons(movie_id, seed_movie_ids, catalog),
            "rank": rank,
            "source": "offline_content_similarity",
        }

    @staticmethod
    def _match_reasons(
        movie_id: str,
        seed_movie_ids: Sequence[str],
        catalog: Mapping[str, Mapping[str, Any]],
    ) -> List[str]:
        candidate = catalog[movie_id]
        candidate_genres = set(movie_genres(candidate))
        seed_genres = set().union(*(set(movie_genres(catalog[seed_id])) for seed_id in seed_movie_ids))
        shared_genres = sorted(candidate_genres & seed_genres)[:2]
        reasons: List[str] = []
        if shared_genres:
            reasons.append(f"Shared genres: {' and '.join(shared_genres)}")

        director = str(candidate.get("director", "")).strip()
        if director and any(
            director.casefold() == str(catalog[seed_id].get("director", "")).strip().casefold()
            for seed_id in seed_movie_ids
        ):
            reasons.append(f"Same director: {director}")

        candidate_year = optional_int(candidate.get("release_year"))
        seed_years = [
            year
            for year in (optional_int(catalog[seed_id].get("release_year")) for seed_id in seed_movie_ids)
            if year is not None
        ]
        if candidate_year is not None and seed_years and abs(candidate_year - sum(seed_years) / len(seed_years)) <= 5:
            reasons.append("Similar release period")

        language = str(candidate.get("language", "")).strip()
        if language and any(
            language.casefold() == str(catalog[seed_id].get("language", "")).strip().casefold()
            for seed_id in seed_movie_ids
        ):
            reasons.append(f"Same language: {language}")
        return reasons[:3]


content_similarity_index = ContentSimilarityIndex()
