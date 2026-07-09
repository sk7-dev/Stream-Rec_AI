import json
import pickle
import sys
from collections import defaultdict, Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import (
    WATCH_HISTORY_PATH,
    MOVIES_PATH,
    ITEM_SIM_PATH,
    POPULAR_PATH,
    USER_TOPN_PATH,
    USER_TOPN_JSON_PATH,
)


def normalize_text(value) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip().lower()


def load_movie_metadata() -> dict:
    if not MOVIES_PATH.exists():
        raise FileNotFoundError(f"Missing file: {MOVIES_PATH}")

    df = pd.read_csv(MOVIES_PATH)

    required = {"movie_id", "genre_primary", "genre_secondary", "title"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns in movies.csv: {sorted(missing)}")

    df = df.dropna(subset=["movie_id"]).copy()
    df["movie_id"] = df["movie_id"].astype(str).str.strip()

    movie_meta = {}
    for _, row in df.iterrows():
        movie_id = str(row["movie_id"])
        movie_meta[movie_id] = {
            "title": row.get("title"),
            "genre_primary": normalize_text(row.get("genre_primary")),
            "genre_secondary": normalize_text(row.get("genre_secondary")),
        }

    return movie_meta


def infer_user_genre_profile(seen_movies, movie_meta):
    primary_counter = Counter()
    secondary_counter = Counter()

    for movie_id in seen_movies:
        meta = movie_meta.get(movie_id, {})
        gp = normalize_text(meta.get("genre_primary", ""))
        gs = normalize_text(meta.get("genre_secondary", ""))

        if gp:
            primary_counter[gp] += 1
        if gs:
            secondary_counter[gs] += 1

    return primary_counter, secondary_counter


def genre_boost(movie_id, user_primary_counter, user_secondary_counter, movie_meta) -> float:
    meta = movie_meta.get(movie_id, {})
    gp = normalize_text(meta.get("genre_primary", ""))
    gs = normalize_text(meta.get("genre_secondary", ""))

    boost = 0.0

    # Stronger boost for primary genre alignment
    if gp:
        boost += min(user_primary_counter.get(gp, 0), 5) * 0.08

    # Smaller boost for secondary genre alignment
    if gs:
        boost += min(user_secondary_counter.get(gs, 0), 5) * 0.04

    return boost


def diversify_candidates(candidates, movie_meta, limit=10, per_primary_cap=4):
    final = []
    genre_counts = Counter()

    for rec in candidates:
        movie_id = str(rec["movie_id"])
        gp = normalize_text(movie_meta.get(movie_id, {}).get("genre_primary", ""))

        # Allow some diversity by capping repeated primary genres
        if gp and genre_counts[gp] >= per_primary_cap:
            continue

        final.append(rec)
        if gp:
            genre_counts[gp] += 1

        if len(final) >= limit:
            break

    return final


def main():
    if not WATCH_HISTORY_PATH.exists():
        raise FileNotFoundError(f"Missing file: {WATCH_HISTORY_PATH}")

    if not ITEM_SIM_PATH.exists():
        raise FileNotFoundError(f"Missing file: {ITEM_SIM_PATH}")

    if not POPULAR_PATH.exists():
        raise FileNotFoundError(f"Missing file: {POPULAR_PATH}")

    with open(ITEM_SIM_PATH, "rb") as f:
        model = pickle.load(f)

    with open(POPULAR_PATH, "rb") as f:
        popular_movies = pickle.load(f)

    item_similarity = model["item_similarity"]
    movie_to_idx = model["movie_to_idx"]
    idx_to_movie = model["idx_to_movie"]

    movie_meta = load_movie_metadata()

    df = pd.read_csv(WATCH_HISTORY_PATH)

    if not {"user_id", "movie_id"}.issubset(df.columns):
        raise ValueError("watch_history.csv must contain user_id and movie_id")

    df = df.dropna(subset=["user_id", "movie_id"]).copy()
    df["user_id"] = df["user_id"].astype(str).str.strip()
    df["movie_id"] = df["movie_id"].astype(str).str.strip()

    # Deduplicated watched history per user, preserving order
    user_history = (
        df.groupby("user_id")["movie_id"]
        .apply(lambda s: list(dict.fromkeys(s.astype(str).tolist())))
        .to_dict()
    )

    user_topn = {}

    for user_id, seen_movies in user_history.items():
        seen_set = set(seen_movies)
        candidate_scores = defaultdict(float)

        user_primary_counter, user_secondary_counter = infer_user_genre_profile(seen_movies, movie_meta)

        # CF candidate generation
        for movie_id in seen_set:
            idx = movie_to_idx.get(movie_id)
            if idx is None:
                continue

            sims = item_similarity[idx].tocoo()

            for neighbor_idx, sim_score in zip(sims.col, sims.data):
                if neighbor_idx == idx:
                    continue

                neighbor_movie = idx_to_movie[neighbor_idx]
                if neighbor_movie in seen_set:
                    continue

                candidate_scores[neighbor_movie] += float(sim_score)

        # Add genre-aware boost
        scored_candidates = []
        for movie_id, cf_score in candidate_scores.items():
            g_boost = genre_boost(
                movie_id=movie_id,
                user_primary_counter=user_primary_counter,
                user_secondary_counter=user_secondary_counter,
                movie_meta=movie_meta,
            )

            final_score = float(cf_score) + g_boost

            scored_candidates.append({
                "movie_id": str(movie_id),
                "cf_score": round(float(cf_score), 6),
                "genre_boost": round(float(g_boost), 6),
                "final_score": round(float(final_score), 6),
            })

        # Rank by final score
        scored_candidates.sort(key=lambda x: x["final_score"], reverse=True)

        # Backfill with popular titles if needed
        used = {rec["movie_id"] for rec in scored_candidates}
        backfilled = scored_candidates[:]

        if len(backfilled) < 50:
            for movie_id in popular_movies:
                movie_id = str(movie_id)
                if movie_id in seen_set or movie_id in used:
                    continue

                g_boost = genre_boost(
                    movie_id=movie_id,
                    user_primary_counter=user_primary_counter,
                    user_secondary_counter=user_secondary_counter,
                    movie_meta=movie_meta,
                )

                backfilled.append({
                    "movie_id": movie_id,
                    "cf_score": 0.01,
                    "genre_boost": round(float(g_boost), 6),
                    "final_score": round(0.01 + float(g_boost), 6),
                })
                used.add(movie_id)

                if len(backfilled) >= 50:
                    break

        # Re-rank after backfill
        backfilled.sort(key=lambda x: x["final_score"], reverse=True)

        # Diversify top results a bit
        diversified_top = diversify_candidates(
            candidates=backfilled,
            movie_meta=movie_meta,
            limit=10,
            per_primary_cap=4,
        )

        # Keep more than top 10 in storage for fallback flexibility
        remaining = [rec for rec in backfilled if rec["movie_id"] not in {r["movie_id"] for r in diversified_top}]
        final_candidates = diversified_top + remaining
        final_candidates = final_candidates[:50]

        user_topn[str(user_id)] = final_candidates

    with open(USER_TOPN_PATH, "wb") as f:
        pickle.dump(user_topn, f, protocol=pickle.HIGHEST_PROTOCOL)

    with open(USER_TOPN_JSON_PATH, "w") as f:
        json.dump(user_topn, f)

    print(f"Saved genre-aware user CF candidates to {USER_TOPN_PATH}")
    print(f"Users with recommendations: {len(user_topn):,}")


if __name__ == "__main__":
    main()