from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MinMaxScaler, normalize

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import (  # noqa: E402
    CONTENT_FEATURES_PATH,
    CONTENT_MODEL_METADATA_PATH,
    CONTENT_SIM_DIR,
    CONTENT_VOCABULARIES_PATH,
    MOVIES_PATH,
)


ARTIFACT_VERSION = 1
REQUIRED_COLUMNS = {
    "movie_id",
    "title",
    "genre_primary",
    "genre_secondary",
    "overview",
    "director",
    "language",
    "country_of_origin",
    "content_type",
    "release_year",
    "duration_minutes",
    "imdb_rating",
}


def clean_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value).strip().lower())


def feature_token(prefix: str, value: Any) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", clean_text(value)).strip("_")
    return f"{prefix}={cleaned}" if cleaned else ""


def load_catalog(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Movie metadata is missing: {path}")

    dataframe = pd.read_csv(path)
    missing = REQUIRED_COLUMNS - set(dataframe.columns)
    if missing:
        raise ValueError(f"movies.csv is missing required columns: {sorted(missing)}")

    dataframe = dataframe.dropna(subset=["movie_id", "title"]).copy()
    dataframe["movie_id"] = dataframe["movie_id"].astype(str).str.strip()
    dataframe["title"] = dataframe["title"].astype(str).str.strip()
    dataframe = dataframe[(dataframe["movie_id"] != "") & (dataframe["title"] != "")]

    duplicates = dataframe[dataframe["movie_id"].duplicated()]["movie_id"].tolist()
    if duplicates:
        raise ValueError(f"movies.csv contains duplicate movie IDs: {duplicates[:5]}")
    if len(dataframe) < 2:
        raise ValueError("movies.csv must contain at least two valid movies.")
    return dataframe.reset_index(drop=True)


def build_feature_matrix(dataframe: pd.DataFrame) -> tuple[sparse.csr_matrix, Dict[str, Any]]:
    overview_vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=2,
        max_features=8_000,
        sublinear_tf=True,
    )
    overview_features = overview_vectorizer.fit_transform(dataframe["overview"].map(clean_text))

    title_vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=2,
        max_features=2_500,
        sublinear_tf=True,
    )
    title_features = title_vectorizer.fit_transform(dataframe["title"].map(clean_text))

    categorical_rows = []
    for _, row in dataframe.iterrows():
        year = pd.to_numeric(row.get("release_year"), errors="coerce")
        decade = int(year // 10 * 10) if pd.notna(year) else None
        features: Dict[str, float] = {}
        for genre_key in ("genre_primary", "genre_secondary"):
            token = feature_token("genre", row.get(genre_key))
            if token:
                features[token] = 1.6
        for prefix, key, weight in (
            ("director", "director", 0.55),
            ("language", "language", 0.30),
            ("country", "country_of_origin", 0.18),
            ("content", "content_type", 0.10),
        ):
            token = feature_token(prefix, row.get(key))
            if token:
                features[token] = weight
        if decade is not None:
            features[f"decade={decade}"] = 0.28
        categorical_rows.append(features)

    categorical_vectorizer = DictVectorizer(sparse=True, sort=True)
    categorical_features = categorical_vectorizer.fit_transform(categorical_rows)

    numeric = dataframe[["duration_minutes", "imdb_rating"]].apply(
        pd.to_numeric, errors="coerce"
    )
    numeric = numeric.fillna(numeric.median()).fillna(0.0)
    numeric_features = sparse.csr_matrix(MinMaxScaler().fit_transform(numeric), dtype=np.float32)

    combined = sparse.hstack(
        [
            overview_features * 0.75,
            title_features * 0.18,
            categorical_features * 1.15,
            # Runtime helps distinguish format; rating is intentionally a tiny signal.
            numeric_features[:, 0] * 0.10,
            numeric_features[:, 1] * 0.025,
        ],
        format="csr",
        dtype=np.float32,
    )
    combined = normalize(combined, norm="l2", axis=1, copy=False).tocsr()

    vocabularies = {
        "overview": {token: int(index) for token, index in overview_vectorizer.vocabulary_.items()},
        "title": {token: int(index) for token, index in title_vectorizer.vocabulary_.items()},
        "categorical_feature_names": categorical_vectorizer.get_feature_names_out().tolist(),
    }
    return combined, vocabularies


def source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    print(f"Loading canonical movie metadata from {MOVIES_PATH}")
    dataframe = load_catalog(MOVIES_PATH)
    print(f"Building content features for {len(dataframe):,} movies")
    feature_matrix, vocabularies = build_feature_matrix(dataframe)

    if feature_matrix.shape[0] != len(dataframe) or not np.isfinite(feature_matrix.data).all():
        raise RuntimeError("Generated feature matrix is invalid.")

    CONTENT_SIM_DIR.mkdir(parents=True, exist_ok=True)
    sparse.save_npz(CONTENT_FEATURES_PATH, feature_matrix, compressed=True)

    metadata = {
        "artifact_version": ARTIFACT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_path": str(MOVIES_PATH),
        "source_sha256": source_sha256(MOVIES_PATH),
        "movie_count": len(dataframe),
        "feature_count": feature_matrix.shape[1],
        "movie_ids": dataframe["movie_id"].tolist(),
        "features_used": [
            "overview TF-IDF word unigrams/bigrams",
            "title TF-IDF character n-grams",
            "primary and secondary genres",
            "director",
            "language",
            "country of origin",
            "content type",
            "release decade",
            "runtime (small weight)",
            "IMDb rating (very small weight)",
        ],
        "trusted_build_note": (
            "Artifacts are generated locally from movies.csv. Rebuild rather than accepting "
            "artifact files from an untrusted source."
        ),
    }
    CONTENT_MODEL_METADATA_PATH.write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    CONTENT_VOCABULARIES_PATH.write_text(
        json.dumps(vocabularies, sort_keys=True), encoding="utf-8"
    )

    print(f"Saved sparse features: {CONTENT_FEATURES_PATH}")
    print(f"Saved artifact metadata: {CONTENT_MODEL_METADATA_PATH}")
    print(f"Saved vectorizer vocabularies: {CONTENT_VOCABULARIES_PATH}")
    print(f"Shape: {feature_matrix.shape[0]:,} movies x {feature_matrix.shape[1]:,} features")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise SystemExit(f"Content-similarity build failed: {exc}") from exc
