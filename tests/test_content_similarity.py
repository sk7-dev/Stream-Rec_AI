from __future__ import annotations

import math
from pathlib import Path

import pytest

from app.services.content_similarity import ContentSimilarityIndex, ContentSimilarityUnavailable


@pytest.mark.parametrize(
    "seeds",
    [
        ["seed_a"],
        ["seed_a", "seed_b"],
        ["seed_a", "seed_b", "seed_c"],
    ],
)
def test_recommendations_for_one_to_three_seeds(sample_index, sample_catalog, seeds):
    results = sample_index.recommend(seeds, 3, sample_catalog)

    assert len(results) == 3
    assert not set(seeds) & {result["movie_id"] for result in results}
    assert all(0.0 <= result["similarity_score"] <= 1.0 for result in results)
    assert all(math.isfinite(result["similarity_score"]) for result in results)
    assert [result["similarity_score"] for result in results] == sorted(
        [result["similarity_score"] for result in results], reverse=True
    )


def test_multi_seed_consistency_rewards_blended_candidate(sample_index, sample_catalog):
    results = sample_index.recommend(["seed_a", "seed_b"], 3, sample_catalog)
    ids = [result["movie_id"] for result in results]

    assert ids.index("blend") < ids.index("only_a")


def test_limit_is_respected_and_results_are_deterministic(sample_index, sample_catalog):
    first = sample_index.recommend(["seed_a"], 2, sample_catalog)
    second = sample_index.recommend(["seed_a"], 2, sample_catalog)

    assert len(first) == 2
    assert first == second


def test_missing_optional_metadata_is_safe(sample_index, sample_catalog):
    results = sample_index.recommend(["seed_c"], 5, sample_catalog)
    other = next(result for result in results if result["movie_id"] == "other")

    assert other["release_year"] is None
    assert other["imdb_rating"] is None
    assert isinstance(other["match_reasons"], list)


def test_artifact_loading_failure_is_explicit():
    index = ContentSimilarityIndex()

    with pytest.raises(ContentSimilarityUnavailable, match="artifacts are missing"):
        index.load(
            Path("definitely-missing-features.npz"),
            Path("definitely-missing-metadata.json"),
            ["seed_a"],
        )

    assert not index.available
    assert index.load_error is not None
