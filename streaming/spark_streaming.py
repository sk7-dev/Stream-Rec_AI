import json
import pickle
import sys
from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col,
    from_json,
    expr,
    sum as spark_sum,
    row_number,
    collect_list,
    struct,
    to_json,
)
from pyspark.sql.types import StructType, StructField, StringType
from pyspark.sql.window import Window
import redis

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import USER_TOPN_PATH, REDIS_HOST, REDIS_PORT, KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC

try:
    with open(USER_TOPN_PATH, "rb") as f:
        USER_TOPN = pickle.load(f)
    print(f"Loaded CF candidates for {len(USER_TOPN)} users")
except FileNotFoundError:
    USER_TOPN = {}
    print("CF candidates not found")

# Redis client
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

# Spark session
spark = (
    SparkSession.builder
    .appName("MovieRecommendationStreaming")
    .master("local[1]")
    .config("spark.sql.shuffle.partitions", "1")
    .config("spark.default.parallelism", "1")
    .config("spark.driver.memory", "512m")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")

# Schema for incoming Kafka JSON. IDs are strings (e.g. "user_00042",
# "movie_0511") to match the CSV data and the offline CF model's keys.
schema = StructType([
    StructField("user_id", StringType(), True),
    StructField("movie_id", StringType(), True),
    StructField("event_type", StringType(), True),
    StructField("ts", StringType(), True),
    StructField("genre", StringType(), True),
])

# Read stream from Kafka
raw_df = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
    .option("subscribe", KAFKA_TOPIC)
    .option("startingOffsets", "latest")
    .load()
)

parsed_df = (
    raw_df
    .selectExpr("CAST(value AS STRING) as json_str")
    .select(from_json(col("json_str"), schema).alias("data"))
    .select("data.*")
)

# Assign event weights
scored_df = (
    parsed_df
    .withColumn(
        "event_score",
        expr("""
            CASE
                WHEN event_type = 'view' THEN 1
                WHEN event_type = 'click' THEN 2
                WHEN event_type = 'watchlist' THEN 3
                WHEN event_type = 'watch' THEN 5
                ELSE 0
            END
        """)
    )
)

# Aggregate scores by user and movie
agg_df = (
    scored_df
    .groupBy("user_id", "movie_id")
    .agg(spark_sum("event_score").alias("score"))
)

# Rank top movies per user
window_spec = Window.partitionBy("user_id").orderBy(col("score").desc())

ranked_df = (
    agg_df
    .withColumn("rank", row_number().over(window_spec))
    .filter(col("rank") <= 10)
)

def write_to_redis(batch_df, batch_id):
    rows = batch_df.collect()

    user_scores = {}

    # Step 1: Start with CF baseline
    for user_id, recs in USER_TOPN.items():
        user_scores[user_id] = {
            rec["movie_id"]: rec.get("cf_score", 0.0)
            for rec in recs
        }

    # Step 2: Add real-time signals
    for row in rows:
        user_id = str(row["user_id"])
        movie_id = str(row["movie_id"])
        score = float(row["score"])

        user_scores.setdefault(user_id, {})
        user_scores[user_id][movie_id] = user_scores[user_id].get(movie_id, 0.0) + score

    # Step 3: Rank + store
    for user_id, movie_dict in user_scores.items():
        ranked = sorted(movie_dict.items(), key=lambda x: x[1], reverse=True)[:10]

        recs = []
        for i, (movie_id, score) in enumerate(ranked, start=1):
            recs.append({
                "movie_id": movie_id,
                "score": score,
                "rank": i
            })

        redis_client.set(f"rec:user:{user_id}", json.dumps(recs))
        print(f"Hybrid recs written for user {user_id}")

query = (
    ranked_df.writeStream
    .outputMode("complete")
    .foreachBatch(write_to_redis)
    .option("checkpointLocation", "/tmp/movie-rec-checkpoint")
    .trigger(processingTime="20 seconds")
    .start()
)

query.awaitTermination()