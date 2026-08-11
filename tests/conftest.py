from __future__ import annotations

import numpy as np
import pytest
from scipy import sparse
from sklearn.preprocessing import normalize

from app.services.content_similarity import ContentSimilarityIndex


@pytest.fixture
def sample_catalog():
    return {
        "seed_a": {
            "title": "Alpha Space",
            "genre_primary": "Sci-Fi",
            "genre_secondary": "Drama",
            "release_year": 2015,
            "language": "English",
            "director": "Director One",
            "imdb_rating": 8.1,
            "poster_url": "https://example.test/a.jpg",
        },
        "seed_b": {
            "title": "Beta Mystery",
            "genre_primary": "Mystery",
            "genre_secondary": "Drama",
            "release_year": 2017,
            "language": "English",
            "director": "Director Two",
            "imdb_rating": 7.8,
            "poster_url": "https://example.test/b.jpg",
        },
        "seed_c": {
            "title": "Gamma Journey",
            "genre_primary": "Adventure",
            "genre_secondary": "Drama",
            "release_year": 2016,
            "language": "French",
            "director": "Director Three",
            "imdb_rating": 7.5,
        },
        "blend": {
            "title": "Combined Worlds",
            "genre_primary": "Drama",
            "genre_secondary": "Sci-Fi",
            "release_year": 2016,
            "language": "English",
            "director": "Director One",
            "imdb_rating": 8.0,
            "poster_url": "https://example.test/blend.jpg",
        },
        "only_a": {
            "title": "Only Alpha",
            "genre_primary": "Sci-Fi",
            "release_year": 1980,
            "language": "German",
            "imdb_rating": 9.0,
        },
        "other": {
            "title": "Other Story",
            "genre_primary": "Comedy",
            "release_year": None,
            "language": None,
            "imdb_rating": None,
        },
    }


@pytest.fixture
def sample_index(sample_catalog):
    movie_ids = list(sample_catalog)
    matrix = sparse.csr_matrix(
        np.array(
            [
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 1.0],
                [0.75, 0.55, 0.30],
                [1.0, 0.0, 0.0],
                [0.10, 0.10, 0.10],
            ],
            dtype=np.float32,
        )
    )
    index = ContentSimilarityIndex()
    index.features = normalize(matrix, axis=1).tocsr()
    index.movie_ids = movie_ids
    index.id_to_row = {movie_id: row for row, movie_id in enumerate(movie_ids)}
    index.artifact_metadata = {"artifact_version": 1}
    return index
