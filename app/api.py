import json
import pickle
import socket
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import pandas as pd
import redis
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    CORS_ORIGINS,
    MOVIES_PATH,
    REDIS_HOST,
    REDIS_PORT,
    USER_TOPN_PATH,
    USERS_PATH,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_user_topn()
    load_movie_metadata()
    load_user_directory()
    check_redis()
    yield


app = FastAPI(title="Movie Recommendation API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_client = redis.Redis(
    host=REDIS_HOST, port=REDIS_PORT, decode_responses=True, socket_connect_timeout=1
)
REDIS_AVAILABLE = False

USER_TOPN: Dict[str, Any] = {}
MOVIE_METADATA: Dict[str, Dict[str, Any]] = {}
USER_DIRECTORY: Dict[str, Dict[str, Any]] = {}


def check_redis() -> bool:
    """Probe Redis with a raw socket + short timeout.

    redis-py's own socket_connect_timeout is not reliably honored on all
    platforms (observed hangs on Windows when nothing is listening), so we
    do a cheap TCP probe first and only touch the redis client when a
    connection is actually reachable.
    """
    global REDIS_AVAILABLE
    try:
        with socket.create_connection((REDIS_HOST, REDIS_PORT), timeout=1):
            REDIS_AVAILABLE = True
    except OSError:
        REDIS_AVAILABLE = False
    return REDIS_AVAILABLE


def get_live_recommendations(user_key: str) -> Optional[List[Dict[str, Any]]]:
    """Return live Redis recommendations, or None if Redis is down/empty."""
    if not REDIS_AVAILABLE:
        return None
    try:
        redis_data = redis_client.get(f"rec:user:{user_key}")
    except redis.exceptions.RedisError:
        return None
    return json.loads(redis_data) if redis_data else None


def load_user_topn():
    global USER_TOPN
    if USER_TOPN_PATH.exists():
        with open(USER_TOPN_PATH, "rb") as f:
            USER_TOPN = pickle.load(f)
        print(f"Loaded offline CF candidates for {len(USER_TOPN):,} users")
    else:
        print(f"Offline CF file not found at {USER_TOPN_PATH}")


def load_movie_metadata():
    global MOVIE_METADATA

    if not MOVIES_PATH.exists():
        print(f"Movie metadata file not found at {MOVIES_PATH}")
        return

    df = pd.read_csv(MOVIES_PATH)

    required = {
        "movie_id", "title", "genre_primary", "genre_secondary", "content_type",
        "language", "release_year", "imdb_rating", "poster_url", "director", "overview",
    }
    existing = [c for c in required if c in df.columns]

    df = df[existing].copy()
    df["movie_id"] = df["movie_id"].astype(str)

    MOVIE_METADATA = {
        row["movie_id"]: {
            k: row[k]
            for k in existing
            if k != "movie_id" and pd.notna(row[k])
        }
        for _, row in df.iterrows()
    }

    print(f"Loaded movie metadata for {len(MOVIE_METADATA):,} movies")


def load_user_directory():
    global USER_DIRECTORY

    if not USERS_PATH.exists():
        print(f"Users file not found at {USERS_PATH}")
        return

    df = pd.read_csv(USERS_PATH)

    required = {"user_id", "first_name", "last_name", "email", "country", "subscription_plan"}
    existing = [c for c in required if c in df.columns]

    df = df[existing].copy()
    df["user_id"] = df["user_id"].astype(str)

    USER_DIRECTORY = {
        row["user_id"]: {
            k: row[k]
            for k in existing
            if k != "user_id" and pd.notna(row[k])
        }
        for _, row in df.iterrows()
    }

    print(f"Loaded user directory for {len(USER_DIRECTORY):,} users")


def enrich_recommendations(recs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    enriched = []

    for i, rec in enumerate(recs, start=1):
        movie_id = str(rec.get("movie_id"))

        item = {
            "movie_id": movie_id,
            "score": rec.get("score", rec.get("cf_score", 0.0)),
            "rank": rec.get("rank", i),
            "source": rec.get("source", "unknown"),
        }

        meta = MOVIE_METADATA.get(movie_id, {})
        item.update(meta)

        enriched.append(item)

    return enriched


@app.get("/health")
def health():
    return {
        "status": "ok",
        "offline_cf_loaded": bool(USER_TOPN),
        "movie_metadata_loaded": bool(MOVIE_METADATA),
        "user_directory_loaded": bool(USER_DIRECTORY),
        "redis_connected": check_redis(),
    }


@app.get("/users")
def search_users(q: Optional[str] = None, limit: int = 20):
    limit = max(1, min(limit, 100))

    items = list(USER_DIRECTORY.items())
    if q:
        q_lower = q.lower()
        items = [
            (user_id, profile)
            for user_id, profile in items
            if q_lower in user_id.lower()
            or q_lower in str(profile.get("email", "")).lower()
            or q_lower in str(profile.get("first_name", "")).lower()
            or q_lower in str(profile.get("last_name", "")).lower()
        ]

    items.sort(key=lambda pair: pair[0])

    return {
        "count": len(items),
        "users": [{"user_id": user_id, **profile} for user_id, profile in items[:limit]],
    }


@app.get("/users/{user_id}")
def get_user(user_id: str):
    profile = USER_DIRECTORY.get(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return {"user_id": user_id, **profile}


@app.get("/movies/{movie_id}")
def get_movie(movie_id: str):
    meta = MOVIE_METADATA.get(movie_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Movie {movie_id} not found")
    return {"movie_id": movie_id, **meta}


@app.get("/recommendations/{user_id}")
def get_recommendations(user_id: str):
    # 1. Prefer live Redis recommendations
    live_recs = get_live_recommendations(user_id)
    if live_recs:
        for i, rec in enumerate(live_recs, start=1):
            rec.setdefault("rank", i)
            rec.setdefault("source", "live_streaming")

        return {
            "user_id": user_id,
            "source": "redis_live",
            "recommendations": enrich_recommendations(live_recs),
        }

    # 2. Fall back to offline CF
    offline_recs = USER_TOPN.get(user_id)
    if offline_recs:
        payload = []
        for i, rec in enumerate(offline_recs[:10], start=1):
            payload.append({
                "movie_id": str(rec["movie_id"]),
                "cf_score": float(rec.get("cf_score", 0.0)),
                "genre_boost": float(rec.get("genre_boost", 0.0)),
                "score": float(rec.get("final_score", rec.get("cf_score", 0.0))),
                "rank": i,
                "source": "offline_cf_review_aware_genre_aware",
            })

        return {
            "user_id": user_id,
            "source": "offline_cf_fallback",
            "recommendations": enrich_recommendations(payload),
        }

    raise HTTPException(
        status_code=404,
        detail=f"No live or offline recommendations found for user {user_id}",
    )
