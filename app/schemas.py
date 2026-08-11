"""Pydantic request and response models for catalog and similarity APIs."""

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class MovieSearchItem(BaseModel):
    movie_id: str
    title: str
    release_year: Optional[int] = None
    poster_url: Optional[str] = None
    genres: List[str] = Field(default_factory=list)


class MovieSearchResponse(BaseModel):
    query: str
    results: List[MovieSearchItem]


class SimilarMoviesRequest(BaseModel):
    movie_ids: List[str] = Field(min_length=1, max_length=3)
    limit: int = Field(default=10, ge=1, le=50)

    @field_validator("movie_ids")
    @classmethod
    def validate_movie_ids(cls, value: List[str]) -> List[str]:
        cleaned = [movie_id.strip() for movie_id in value]
        if any(not movie_id for movie_id in cleaned):
            raise ValueError("Movie IDs cannot be blank.")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Select unique movies; duplicate movie IDs are not allowed.")
        return cleaned


class SimilarMovieItem(MovieSearchItem):
    genre_primary: Optional[str] = None
    genre_secondary: Optional[str] = None
    language: Optional[str] = None
    imdb_rating: Optional[float] = None
    similarity_score: float = Field(ge=0.0, le=1.0)
    match_reasons: List[str] = Field(default_factory=list)
    rank: int = Field(ge=1)
    source: str = "offline_content_similarity"


class SimilarMoviesResponse(BaseModel):
    seed_movies: List[MovieSearchItem]
    recommendations: List[SimilarMovieItem]
    source: str = "offline_content_similarity"
