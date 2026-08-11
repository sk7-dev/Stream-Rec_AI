from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.services.content_similarity import ContentSimilarityIndex


@pytest.fixture
def client(monkeypatch, sample_catalog, sample_index):
    monkeypatch.setattr(api_module, "MOVIE_METADATA", sample_catalog)
    monkeypatch.setattr(api_module, "content_similarity_index", sample_index)
    return TestClient(api_module.app)


def test_movie_search_is_case_insensitive_and_prioritizes_prefix(client):
    response = client.get("/movies/search", params={"q": "ALPHA", "limit": 10})

    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "ALPHA"
    assert payload["results"][0]["movie_id"] == "seed_a"


def test_movie_search_limit_and_short_query(client):
    limited = client.get("/movies/search", params={"q": "a", "limit": 2})
    broad = client.get("/movies/search", params={"q": "story", "limit": 1})

    assert limited.status_code == 200
    assert limited.json()["results"] == []
    assert broad.status_code == 200
    assert len(broad.json()["results"]) <= 1


@pytest.mark.parametrize(
    "movie_ids",
    [[], ["seed_a", "seed_b", "seed_c", "blend"], ["seed_a", "seed_a"]],
)
def test_similar_request_validation(client, movie_ids):
    response = client.post("/recommendations/similar", json={"movie_ids": movie_ids})
    assert response.status_code == 422


def test_unknown_movie_id_returns_404(client):
    response = client.post(
        "/recommendations/similar", json={"movie_ids": ["does_not_exist"]}
    )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_successful_similar_response_schema_and_seed_exclusion(client):
    response = client.post(
        "/recommendations/similar",
        json={"movie_ids": ["seed_a", "seed_b"], "limit": 3},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "offline_content_similarity"
    assert [movie["movie_id"] for movie in payload["seed_movies"]] == ["seed_a", "seed_b"]
    assert len(payload["recommendations"]) == 3
    assert not {"seed_a", "seed_b"} & {
        movie["movie_id"] for movie in payload["recommendations"]
    }
    assert all(0 <= movie["similarity_score"] <= 1 for movie in payload["recommendations"])


def test_model_unavailable_returns_503(client, monkeypatch):
    unavailable = ContentSimilarityIndex()
    unavailable.clear("test artifact failure")
    monkeypatch.setattr(api_module, "content_similarity_index", unavailable)

    response = client.post("/recommendations/similar", json={"movie_ids": ["seed_a"]})

    assert response.status_code == 503
    assert "model is unavailable" in response.json()["detail"]
