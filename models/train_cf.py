import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import (
    MODELS_DIR,
    WATCH_HISTORY_PATH,
    REVIEWS_PATH,
    ITEM_SIM_PATH,
    POPULAR_PATH,
    INTERACTIONS_PATH,
)


def safe_float(value, default=0.0) -> float:
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def safe_int(value, default=0) -> int:
    try:
        if pd.isna(value):
            return default
        return int(value)
    except Exception:
        return default


def action_weight(action: str) -> float:
    action = str(action).strip().lower()

    mapping = {
        "view": 1.0,
        "click": 2.0,
        "watchlist": 3.0,
        "watch": 5.0,
        "completed": 5.0,
        "pause": 1.5,
        "resume": 2.0,
        "skip": 0.5,
    }
    return mapping.get(action, 1.0)


def build_watch_score(row: pd.Series) -> float:
    score = 0.0

    # Base event signal
    score += action_weight(row.get("action", ""))

    # Progress signal
    progress = min(max(safe_float(row.get("progress_percentage", 0.0), 0.0), 0.0), 100.0)
    score += (progress / 100.0) * 2.0

    # Duration signal
    duration = min(max(safe_float(row.get("watch_duration_minutes", 0.0), 0.0), 0.0), 300.0)
    score += (duration / 300.0) * 1.5

    # User rating from watch_history if present
    user_rating = safe_float(row.get("user_rating", np.nan), np.nan)
    if not np.isnan(user_rating):
        score += (min(max(user_rating, 0.0), 5.0) / 5.0) * 1.0

    # Completion bonus
    if progress >= 90:
        score += 1.0

    # Download intent can imply stronger interest
    is_download = str(row.get("is_download", "")).strip().lower()
    if is_download in {"true", "1", "yes"}:
        score += 0.5

    return round(score, 4)


def preprocess_watch_history(df: pd.DataFrame) -> pd.DataFrame:
    required_cols = {
        "user_id",
        "movie_id",
        "watch_duration_minutes",
        "progress_percentage",
        "action",
    }
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns in watch_history.csv: {sorted(missing)}")

    df = df.dropna(subset=["user_id", "movie_id"]).copy()
    df["user_id"] = df["user_id"].astype(str).str.strip()
    df["movie_id"] = df["movie_id"].astype(str).str.strip()
    df = df[(df["user_id"] != "") & (df["movie_id"] != "")].copy()

    df["watch_score"] = df.apply(build_watch_score, axis=1)

    watch_agg = (
        df.groupby(["user_id", "movie_id"], as_index=False)["watch_score"]
        .sum()
    )

    return watch_agg


def preprocess_reviews(df: pd.DataFrame) -> pd.DataFrame:
    required_cols = {"user_id", "movie_id", "rating", "sentiment_score", "helpful_votes", "total_votes", "is_verified_watch"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns in reviews.csv: {sorted(missing)}")

    df = df.dropna(subset=["user_id", "movie_id"]).copy()
    df["user_id"] = df["user_id"].astype(str).str.strip()
    df["movie_id"] = df["movie_id"].astype(str).str.strip()
    df = df[(df["user_id"] != "") & (df["movie_id"] != "")].copy()

    # Review rating boost: scale 1-5 to roughly 0-2
    df["review_rating_boost"] = df["rating"].apply(lambda x: (min(max(safe_float(x, 0.0), 0.0), 5.0) / 5.0) * 2.0)

    # Sentiment score boost:
    # assume sentiment_score roughly in [-1, 1] or [0, 1], normalize carefully
    def normalize_sentiment(x: float) -> float:
        val = safe_float(x, 0.0)
        if val < 0:
            # map [-1,1] to [0,1]
            val = (val + 1.0) / 2.0
        return min(max(val, 0.0), 1.0)

    df["sentiment_boost"] = df["sentiment_score"].apply(lambda x: normalize_sentiment(x) * 1.5)

    # Helpful votes confidence boost
    def helpfulness_boost(row: pd.Series) -> float:
        helpful = max(safe_int(row.get("helpful_votes", 0), 0), 0)
        total = max(safe_int(row.get("total_votes", 0), 0), 0)

        if total <= 0:
            ratio = 0.0
        else:
            ratio = helpful / total

        # cap influence so it doesn't dominate
        return min(ratio, 1.0) * 0.75

    df["helpfulness_boost"] = df.apply(helpfulness_boost, axis=1)

    # Verified watches get slightly more trust
    def verified_boost(x) -> float:
        val = str(x).strip().lower()
        return 0.5 if val in {"true", "1", "yes"} else 0.0

    df["verified_boost"] = df["is_verified_watch"].apply(verified_boost)

    df["review_score"] = (
        df["review_rating_boost"]
        + df["sentiment_boost"]
        + df["helpfulness_boost"]
        + df["verified_boost"]
    )

    review_agg = (
        df.groupby(["user_id", "movie_id"], as_index=False)["review_score"]
        .mean()
    )

    return review_agg


def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    if not WATCH_HISTORY_PATH.exists():
        raise FileNotFoundError(f"Missing file: {WATCH_HISTORY_PATH}")

    print(f"Loading watch history from {WATCH_HISTORY_PATH}")
    watch_df = pd.read_csv(WATCH_HISTORY_PATH)
    watch_agg = preprocess_watch_history(watch_df)
    print(f"Watch interactions aggregated: {len(watch_agg):,}")

    if REVIEWS_PATH.exists():
        print(f"Loading reviews from {REVIEWS_PATH}")
        reviews_df = pd.read_csv(REVIEWS_PATH)
        review_agg = preprocess_reviews(reviews_df)
        print(f"Review interactions aggregated: {len(review_agg):,}")
    else:
        print(f"reviews.csv not found at {REVIEWS_PATH}; continuing without reviews")
        review_agg = pd.DataFrame(columns=["user_id", "movie_id", "review_score"])

    # Merge watch behavior with review signals
    interactions = watch_agg.merge(
        review_agg,
        on=["user_id", "movie_id"],
        how="left"
    )

    interactions["review_score"] = interactions["review_score"].fillna(0.0)

    # Final combined score
    interactions["score"] = interactions["watch_score"] + interactions["review_score"]

    interactions = interactions[["user_id", "movie_id", "score"]].copy()

    print(f"Final user-movie interactions: {len(interactions):,}")

    interactions.to_parquet(INTERACTIONS_PATH, index=False)

    # Build sparse matrix
    unique_users = interactions["user_id"].unique().tolist()
    unique_movies = interactions["movie_id"].unique().tolist()

    user_to_idx = {u: i for i, u in enumerate(unique_users)}
    movie_to_idx = {m: i for i, m in enumerate(unique_movies)}
    idx_to_movie = {i: m for m, i in movie_to_idx.items()}

    rows = interactions["user_id"].map(user_to_idx).to_numpy()
    cols = interactions["movie_id"].map(movie_to_idx).to_numpy()
    vals = interactions["score"].astype(float).to_numpy()

    user_item_matrix = csr_matrix(
        (vals, (rows, cols)),
        shape=(len(unique_users), len(unique_movies)),
        dtype=np.float32,
    )

    # Item-item CF
    item_user_matrix = user_item_matrix.T
    item_similarity = cosine_similarity(item_user_matrix, dense_output=False)

    # Popular fallback
    popular_movies = (
        interactions.groupby("movie_id", as_index=False)["score"]
        .sum()
        .sort_values("score", ascending=False)["movie_id"]
        .astype(str)
        .tolist()
    )

    with open(ITEM_SIM_PATH, "wb") as f:
        pickle.dump(
            {
                "item_similarity": item_similarity,
                "movie_to_idx": movie_to_idx,
                "idx_to_movie": idx_to_movie,
                "user_to_idx": user_to_idx,
            },
            f,
            protocol=pickle.HIGHEST_PROTOCOL,
        )

    with open(POPULAR_PATH, "wb") as f:
        pickle.dump(popular_movies, f, protocol=pickle.HIGHEST_PROTOCOL)

    print(f"Saved review-aware item similarity model to {ITEM_SIM_PATH}")
    print(f"Saved popularity fallback to {POPULAR_PATH}")
    print(f"Users: {len(unique_users):,}, Movies: {len(unique_movies):,}")


if __name__ == "__main__":
    main()