import json
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from kafka import KafkaProducer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC, USERS_PATH, MOVIES_PATH

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
)

# Sample real user/movie IDs so live events line up with the offline model
# (which is keyed by the "user_XXXXX" / "movie_XXXX" IDs from the CSVs).
user_ids = pd.read_csv(USERS_PATH, usecols=["user_id"])["user_id"].astype(str).tolist()
movie_ids = pd.read_csv(MOVIES_PATH, usecols=["movie_id"])["movie_id"].astype(str).tolist()

event_types = ["view", "click", "watchlist", "watch"]
genres = [
    "action",
    "comedy",
    "drama",
    "thriller",
    "sci-fi",
    "romance",
    "horror",
    "documentary",
    "animation",
]


def generate_event():
    return {
        "user_id": random.choice(user_ids),
        "movie_id": random.choice(movie_ids),
        "event_type": random.choices(
            event_types, weights=[0.5, 0.2, 0.15, 0.15], k=1
        )[0],
        "ts": datetime.now(timezone.utc).isoformat(),
        "genre": random.choice(genres),
    }


if __name__ == "__main__":
    while True:
        event = generate_event()
        producer.send(KAFKA_TOPIC, event)
        producer.flush()
        print("Sent:", event, flush=True)
        time.sleep(random.uniform(0.5, 1.5))
