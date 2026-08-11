# RUNBOOK.md

## Real-Time Movie Recommendation System

This runbook explains how the system works end to end, then shows two ways
to run it:

- **Offline mode** — API + offline model + frontend only. No Kafka, Spark,
  or Redis required. Runs on any machine (including native Windows) in a
  few minutes. This is the fastest way to develop against or demo the app.
- **Online mode** — adds the full real-time pipeline (Kafka → Spark →
  Redis) on top of offline mode, so recommendations update live as
  simulated viewing activity streams in.

Online mode needs Kafka and Spark, which are painful to run natively on
Windows. Run it on Linux, WSL2, or the EC2 instance this was originally
built for. Offline mode has no such constraint.

---

## 1. How it works end to end

In addition to the personalized pipeline below, the application includes a separate offline
content-similarity workflow:

```text
1–3 selected movies -> React autocomplete -> POST /recommendations/similar
                    -> models/content_similarity/features.npz
                    -> blended local cosine scoring + diversity reranking
                    -> enriched similar-movie cards
```

Build or refresh this artifact with `python models/build_content_similarity.py`. It uses only
`data/movies.csv`; it does not read user history or contact Redis, Kafka, Spark, or an external
recommendation API. See `README.md` for the scoring formula, API examples, tests, and limitations.

```
                    ┌─────────────────────────────────────────┐
                    │              OFFLINE (batch)             │
                    │                                           │
 data/watch_history.csv ──┐                                     │
 data/reviews.csv ─────────┼──▶ models/train_cf.py               │
                    │      │      builds item-item similarity    │
                    │      │      + popularity fallback          │
                    │      │      → item_similarity.pkl          │
                    │      │      → popular_movies.pkl           │
                    │      │                                     │
 data/movies.csv ──────────┼──▶ models/build_candidates.py       │
                    │      │      per user: CF candidates        │
                    │      │      + genre-aware boost/diversity  │
                    │      │      → user_topn.pkl                │
                    └──────┴─────────────────────────────────────┘
                                        │
                                        │ (read at API startup)
                                        ▼
                    ┌─────────────────────────────────────────┐
                    │                  API                     │
                    │         app/api.py (FastAPI)              │
                    │                                           │
                    │  GET /recommendations/{user_id}:          │
                    │   1. Redis has rec:user:{id}?  → use it   │
                    │      (source: "redis_live")               │
                    │   2. else fall back to user_topn.pkl      │
                    │      (source: "offline_cf_fallback")      │
                    │   3. else 404                             │
                    └───────────────────▲───────────────────────┘
                                        │ GET rec:user:{id}
                                        │
                    ┌───────────────────┴───────────────────────┐
                    │               ONLINE (streaming)            │
                    │                                             │
 producer/generate_events.py ──▶ Kafka topic "user-events"        │
   (simulates users watching/                  │                  │
    clicking/watchlisting real                 ▼                  │
    movies from movies.csv)      streaming/spark_streaming.py     │
                                  (Spark Structured Streaming)     │
                                  - reads Kafka every 20s          │
                                  - scores events by type          │
                                  - blends with user_topn.pkl      │
                                    as a baseline                  │
                                  - writes top 10/user to Redis    │
                                    key rec:user:{user_id}         │
                    └─────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────┐
                    │              FRONTEND                    │
                    │   frontend/ (React + Vite + TS)          │
                    │   - search a user (GET /users)           │
                    │   - fetch their recs (GET /recommendations/{id}) │
                    │   - render movie cards w/ real posters   │
                    │   - health badge (GET /health)           │
                    └─────────────────────────────────────────┘
```

**Data**: `data/movies.csv` holds 1,000 real movies (title, genre, year,
IMDb rating, poster URL, director, overview — sourced from a public IMDb
Top 1000 dataset). `data/users.csv`, `watch_history.csv`, and `reviews.csv`
are synthetic but reference real `movie_id`s. IDs are strings throughout
(`user_00001`, `movie_0001`) — the API, offline model, and streaming job
all key on them directly, so there's no ID-format translation anywhere.

**Ranking priority**: the API always prefers a live Redis entry for a user
over the offline fallback. Once the streaming pipeline has written at
least one batch for a user, that user's `source` flips from
`offline_cf_fallback` to `redis_live` and stays there as long as Redis has
the key.

---

## 2. Repository layout

```
app/            FastAPI backend + shared config (app/config.py)
models/         Offline training: item-item CF, popularity fallback, genre-aware candidates
producer/       Kafka event generator (simulates user activity on real movies)
streaming/      Spark Structured Streaming job (Kafka -> Redis)
data/           Source CSVs (users, movies, watch history, reviews)
frontend/       React + TypeScript + Tailwind UI
```

## 3. Configuration

Everything below is read from the environment (see `.env.example`), with
working local defaults — nothing is hardcoded to a specific machine or path.

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `REC_SYS_BASE_DIR` | repo root (inferred) | all Python entrypoints | Where `data/` and `models/` live. Only set this if the checkout path can't be inferred (e.g. some unusual packaging) |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | API, Spark job | Live recommendation store |
| `KAFKA_BOOTSTRAP_SERVERS` / `KAFKA_TOPIC` | `localhost:9092` / `user-events` | producer, Spark job | Event stream |
| `CORS_ORIGINS` | `http://localhost:5173` | API | Origins allowed to call the API |
| `VITE_API_BASE_URL` (frontend `.env`) | `http://localhost:8000` | frontend | Where the frontend calls the API |

---

## 4. Offline mode (recommended starting point)

This is everything except Kafka/Spark/Redis. The API serves offline
collaborative-filtering recommendations directly; `GET /health` will show
`redis_connected: false`, and every response's `source` will be
`offline_cf_fallback`. That's expected and correct — this mode never
touches Redis.

### 4.1 Install dependencies

```bash
cd realtime-rec-system
pip install -r requirements.txt
cp .env.example .env
```

### 4.2 Build the offline models

Run whenever `data/*.csv` changes or model logic changes:

```bash
python models/train_cf.py
```

Expected outputs: `models/item_similarity.pkl`, `models/popular_movies.pkl`,
`models/user_item_interactions.parquet`.

```bash
python models/build_candidates.py
```

Expected outputs: `models/user_topn.pkl`, `models/user_topn.json`.

### 4.3 Start the API

```bash
python -m uvicorn app.api:app --reload --port 8000
```

### 4.4 Validate

```bash
curl http://localhost:8000/health
# {"status":"ok","offline_cf_loaded":true,"movie_metadata_loaded":true,"user_directory_loaded":true,"redis_connected":false}

curl "http://localhost:8000/users?q=erica&limit=3"
# real users matching the query, e.g. user_00001

curl http://localhost:8000/recommendations/user_00001
# {"user_id":"user_00001","source":"offline_cf_fallback","recommendations":[...real movies with posters...]}
```

Any `user_XXXXX` ID from `data/users.csv` works.

### 4.5 Start the frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173, search for a user, and confirm recommendations
render with posters. The header badge will read "Offline only" (amber) —
that's correct for this mode.

Offline mode is now fully running: **API (8000) + frontend (5173)**, no
other services needed.

---

## 5. Online mode (adds the real-time pipeline)

Everything in offline mode, plus Kafka, Spark Structured Streaming, and
Redis, so recommendations update live as simulated events stream in.

### 5.1 Prerequisites

- Everything from offline mode already running (or at least the offline
  models already built — the API can be started last)
- Redis, Kafka, and Spark installed. On Linux/EC2:

```
~/redis-stable/
~/kafka/
~/spark/
~/realtime-rec-system/   (this repo)
~/realtime-rec-system/jars/
```

- Spark needs these jars in `jars/` (versions matter — must match your
  Spark/Kafka install):
  - `spark-sql-kafka-0-10_2.12-3.5.1.jar`
  - `kafka-clients-3.5.1.jar`
  - `commons-pool2-2.11.1.jar`
  - `spark-token-provider-kafka-0-10_2.12-3.5.1.jar`

Use separate terminals for each long-running process.

### 5.2 Start Redis

```bash
cd ~/redis-stable
src/redis-server
```

Validate (new terminal):

```bash
src/redis-cli ping
# PONG
```

### 5.3 Start Kafka

```bash
cd ~/kafka
bin/kafka-storage.sh random-uuid
# copy the printed UUID
bin/kafka-storage.sh format -t YOUR_UUID_HERE -c config/kraft/server.properties
export KAFKA_HEAP_OPTS="-Xms128m -Xmx256m"
bin/kafka-server-start.sh config/kraft/server.properties
```

### 5.4 Create the Kafka topic

```bash
cd ~/kafka
bin/kafka-topics.sh --create --topic user-events --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
# "already exists" is fine on repeat runs

bin/kafka-topics.sh --list --bootstrap-server localhost:9092
# user-events
```

### 5.5 Start the event generator

Simulates users watching/clicking/watchlisting real movies from
`data/movies.csv` — it samples actual `user_id`/`movie_id` pairs from the
CSVs, so generated events line up with the offline model.

```bash
cd ~/realtime-rec-system
python producer/generate_events.py
```

Expected output (repeating):

```
Sent: {'user_id': 'user_04512', 'movie_id': 'movie_0231', 'event_type': 'watch', 'ts': '...', 'genre': 'drama'}
```

Leave it running.

### 5.6 Start Spark streaming

```bash
cd ~/realtime-rec-system
rm -rf /tmp/movie-rec-checkpoint   # clear stale checkpoint state
spark-submit \
  --master local[1] \
  --driver-memory 512m \
  --jars jars/spark-sql-kafka-0-10_2.12-3.5.1.jar,jars/kafka-clients-3.5.1.jar,jars/commons-pool2-2.11.1.jar,jars/spark-token-provider-kafka-0-10_2.12-3.5.1.jar \
  streaming/spark_streaming.py
```

Leave it running. Wait 20–40 seconds for the first micro-batch (it
triggers every 20s).

### 5.7 Verify live recommendations landed in Redis

```bash
src/redis-cli KEYS "rec:user:*"
# 1) "rec:user:user_00067"
# 2) "rec:user:user_00152"

src/redis-cli GET rec:user:user_00067
# JSON recommendation list
```

### 5.8 Start the API

```bash
cd ~/realtime-rec-system
python -m uvicorn app.api:app --host 0.0.0.0 --port 8000
```

### 5.9 Validate the full pipeline

```bash
curl http://localhost:8000/health
# redis_connected should now be true

curl http://localhost:8000/recommendations/user_00067
# source: "redis_live" if that user has an active Kafka event, else
# "offline_cf_fallback" — both are valid, this is how the priority works
```

From your laptop (if running on EC2): open
`http://YOUR_PUBLIC_IP:8000/docs`, then hit
`http://YOUR_PUBLIC_IP:8000/recommendations/user_00067`.

Point the frontend's `.env` (`VITE_API_BASE_URL`) at that same host/port —
its header badge should now read "Live streaming" (green) once Redis is
connected.

### 5.10 Demo script

1. Start Redis → Kafka → topic → producer → Spark → API (in that order)
2. Open the frontend, search a user, note the recommendation source badge
3. Leave the producer running; wait 20–30s for another Spark micro-batch
4. Refresh the same user's recommendations — source should now say "Live
   from Redis" and the list may have shifted based on simulated activity
5. Explain the hybrid architecture: offline review-aware CF + genre-aware
   candidates as the baseline, Kafka + Spark for real-time signal, Redis
   for low-latency serving, FastAPI merges both with Redis taking priority

---

## 6. Restart behavior

Public IP may change if an EC2 instance restarts — update your SSH command
accordingly. You don't need to retrain the offline model on every restart,
only when `data/*.csv` or model logic changes.

Normal startup order: Redis → Kafka → topic check → producer → Spark → API
(→ frontend, any time).

---

## 7. Troubleshooting

**Redis connection refused** — start Redis again (`src/redis-server`). The
API tolerates this fine in offline mode; `/health` will just show
`redis_connected: false`.

**Kafka `NoBrokersAvailable`** — Kafka isn't running; restart it.

**Kafka `No meta.properties found`** — re-run the storage format step:

```bash
cd ~/kafka
bin/kafka-storage.sh random-uuid
bin/kafka-storage.sh format -t YOUR_UUID_HERE -c config/kraft/server.properties
export KAFKA_HEAP_OPTS="-Xms128m -Xmx256m"
bin/kafka-server-start.sh config/kraft/server.properties
```

**Redis has no `rec:user:*` keys** — Spark isn't processing; check the
Spark terminal for errors, and confirm the producer is actually sending
events (it prints one per send).

**API returns 404 for a user** — the user ID isn't in Redis and isn't in
`user_topn.pkl`. Check the ID exists in `data/users.csv`
(`user_XXXXX` format), and that `models/build_candidates.py` has been run.

**Port already in use on restart (`uvicorn`/`vite`)** — find and stop the
old process before starting a new one:

```bash
# Linux/macOS
lsof -i :8000
kill <pid>

# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 8000 | Select-Object OwningProcess
Stop-Process -Id <pid> -Force
```
<<<<<<< HEAD

**A CSV in `data/` can't be written (Windows, `PermissionError`)** —
something has it open (commonly Excel). Close the workbook and retry;
Windows holds an exclusive lock while a CSV is open in Excel.

**SSH stopped working after an EC2 restart** — check whether the instance's
public IP changed, and that the security group still allows SSH from your
current IP.

---

## 8. Shutdown

Stop processes with `Ctrl+C` in each terminal. Recommended order: frontend
→ FastAPI → Spark → producer → Kafka → Redis.

If you're done for the day and running on EC2, stop the instance in AWS to
avoid unnecessary charges.
=======
>>>>>>> 575d379d712491ade543aa5697c34e02da69180c
