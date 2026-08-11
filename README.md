# Real-Time and Offline Movie Recommendation System

This full-stack application supports two independent recommendation workflows:

1. **Personalized recommendations** search for a user and prefer live Redis results, with
   precomputed collaborative-filtering candidates as a fallback.
2. **Find Similar Movies** accepts one to three movie titles and uses a fully local,
   content-based model. This workflow requires no user, Redis, Kafka, Spark, live activity,
   external recommendation API, or network access for scoring.

The frontend is React, TypeScript, Vite, and Tailwind CSS. The backend is FastAPI. Canonical
movie metadata is stored in `data/movies.csv`.

## Architecture

```text
Personalized:
User search -> React -> GET /recommendations/{user_id}
                         -> Redis live recommendations when available
                         -> offline collaborative-filtering fallback otherwise

Similar movies:
One to three selected movies
          ↓
React movie autocomplete (GET /movies/search)
          ↓
POST /recommendations/similar
          ↓
Local sparse content-feature matrix
          ↓
Metadata enrichment and deterministic diversity ranking
          ↓
Similar movie cards with match scores and verified explanations
```

## Similarity model

Build the artifact whenever `data/movies.csv` changes:

```powershell
python models/build_content_similarity.py
```

This creates trusted local artifacts under `models/content_similarity/`:

- `features.npz` — normalized SciPy sparse feature matrix
- `metadata.json` — version, source hash, features, and movie ID-to-row order
- `vocabularies.json` — inspectable TF-IDF and categorical vocabularies

The API loads and validates these files once at startup. It refuses to serve fabricated
results when files are missing, invalid, or no longer align with the catalog. Artifacts must
come from this trusted local build process.

### Features and weights

- Overview word TF-IDF, including unigrams and bigrams
- Title character TF-IDF for related titles and franchises
- Strong primary and secondary genre features
- Director, language, production country, content type, and release decade
- Runtime with a small weight
- IMDb rating with a very small weight; it cannot dominate content similarity

Selected feature rows are already L2-normalized. For multiple seeds, their mean profile is
normalized before scoring. The unrounded ranking score is:

```text
final_score =
    0.70 * cosine(candidate, blended_profile)
  + 0.25 * average(cosine(candidate, each_seed))
  + 0.05 * minimum(cosine(candidate, each_seed))
```

The minimum-similarity term discourages a result from matching only one seed. Scores are
finite, clamped to `[0, 1]`, and rounded only in the API response. A light primary-genre cap
adds diversity, while IMDb rating is used only as a deterministic tie-breaker. Match reasons
are generated only from real shared genres, directors, languages, and release years.

## API

### Search local movies

```http
GET /movies/search?q=inter&limit=10
```

Queries shorter than two characters return an empty result set. Exact matches rank before
title prefixes, word prefixes, and substring matches. `limit` must be between 1 and 50.

### Find similar movies

```http
POST /recommendations/similar
Content-Type: application/json

{
  "movie_ids": ["movie_0022", "movie_0330"],
  "limit": 10
}
```

The request requires one to three unique, known movie IDs. Selected seeds are always excluded.
The response contains enriched metadata, `similarity_score`, `match_reasons`, rank, and source
`offline_content_similarity`.

The existing `GET /users`, `GET /recommendations/{user_id}`, health, and movie-detail contracts
remain available.

## Setup and running

```powershell
python -m pip install -r requirements.txt
python models/build_content_similarity.py
python -m uvicorn app.api:app --reload --port 8000
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Use the mode switcher to choose personalized recommendations or
Find Similar Movies.

## Tests and checks

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q

cd frontend
npm test
npm run lint
npm run build
```

## Dataset assumptions and limitations

- `data/movies.csv` is canonical and currently contains 1,000 unique string IDs.
- Title, primary genre, overview, director, language, release year, runtime, IMDb rating, and
  poster URL are present. Secondary genre may be absent and is handled safely.
- The installed catalog currently labels every row as `Movie`; the engine also supports other
  content types if future metadata adds them.
- The similarity model has no cast, keyword, or learned semantic embedding data, so synopsis,
  genres, and available metadata determine thematic similarity.
- Poster URLs in the existing catalog are remote. Recommendation scoring remains fully offline,
  and the UI displays a local gradient fallback when artwork cannot load.
- Rebuild artifacts after every catalog change. Startup validation detects movie-ID drift but
  does not silently rebuild production artifacts.

See `RUNBOOK.md` for the full personalized offline/online operating guide.
