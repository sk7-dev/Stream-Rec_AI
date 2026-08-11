"""Shared configuration for all entrypoints (API, training, streaming, producer).

Every path/host defaults to sensible local values so the project runs out of
the box on a laptop, but every value can be overridden with an env var for
EC2/production deployment (see .env.example).
"""
import os
from pathlib import Path

# Repo root is two levels up from this file (app/config.py -> app -> repo root).
BASE_DIR = Path(os.environ.get("REC_SYS_BASE_DIR", Path(__file__).resolve().parent.parent))

DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

WATCH_HISTORY_PATH = DATA_DIR / "watch_history.csv"
REVIEWS_PATH = DATA_DIR / "reviews.csv"
MOVIES_PATH = DATA_DIR / "movies.csv"
USERS_PATH = DATA_DIR / "users.csv"

ITEM_SIM_PATH = MODELS_DIR / "item_similarity.pkl"
POPULAR_PATH = MODELS_DIR / "popular_movies.pkl"
INTERACTIONS_PATH = MODELS_DIR / "user_item_interactions.parquet"
USER_TOPN_PATH = MODELS_DIR / "user_topn.pkl"
USER_TOPN_JSON_PATH = MODELS_DIR / "user_topn.json"
CONTENT_SIM_DIR = MODELS_DIR / "content_similarity"
CONTENT_FEATURES_PATH = CONTENT_SIM_DIR / "features.npz"
CONTENT_MODEL_METADATA_PATH = CONTENT_SIM_DIR / "metadata.json"
CONTENT_VOCABULARIES_PATH = CONTENT_SIM_DIR / "vocabularies.json"

REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))

KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC = os.environ.get("KAFKA_TOPIC", "user-events")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
