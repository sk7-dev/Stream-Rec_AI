# Stream-Rec AI

Hybrid movie recommendation system: an offline review-aware collaborative
filtering model backfills genre-aware candidates per user, and a Kafka +
Spark streaming pipeline layers on near-real-time signal, served through a
FastAPI backend with a React frontend.

```
app/            FastAPI backend + shared config
models/         Offline training: item-item CF, popularity fallback, genre-aware candidates
producer/       Kafka event generator (simulates user activity)
streaming/      Spark Structured Streaming job (Kafka -> Redis)
data/           Source CSVs (users, movies, watch history, reviews)
frontend/       React + TypeScript + Tailwind UI
```

For the full EC2 deployment runbook (Kafka/Spark/Redis setup, terminal-by-
terminal instructions), see [RUNBOOK.md](RUNBOOK.md). This README covers
running things locally.

## Backend

```bash
pip install -r requirements.txt
cp .env.example .env   # defaults work for local dev

# One-time (or whenever data/model logic changes): build the offline models
python models/train_cf.py
python models/build_candidates.py

# Serve the API
python -m uvicorn app.api:app --reload --port 8000
```

The API works standalone off the offline model — Redis, Kafka, and Spark are
optional for local development. `GET /health` reports `redis_connected` so
you can tell which recommendation path is active. To exercise the full live
pipeline, follow the Kafka/Spark/Redis sections of RUNBOOK.md; producer and
streaming scripts also read their hosts/paths from `.env`.

IDs are strings throughout (`user_00001`, `movie_0001`), matching the CSV
data — the API, offline model, and streaming job all key on these directly.

## Frontend

```bash
cd frontend
npm install
cp .env.example .env   # points at http://localhost:8000 by default
npm run dev
```

Opens on http://localhost:5173 — search for a user and view their
recommendations. See [frontend/README.md](frontend/README.md) for details.

## Configuration

All paths and hosts are environment-driven (see `.env.example`); nothing is
hardcoded to a particular machine. Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `REC_SYS_BASE_DIR` | repo root | Where `data/` and `models/` live |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Live recommendation store |
| `KAFKA_BOOTSTRAP_SERVERS` / `KAFKA_TOPIC` | `localhost:9092` / `user-events` | Streaming pipeline |
| `CORS_ORIGINS` | `http://localhost:5173` | Origins allowed to call the API |
