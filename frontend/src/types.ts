export interface UserSummary {
  user_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  country?: string;
  subscription_plan?: string;
}

export interface UserSearchResponse {
  count: number;
  users: UserSummary[];
}

export interface Recommendation {
  movie_id: string;
  score: number;
  rank: number;
  source: string;
  title?: string;
  genre_primary?: string;
  genre_secondary?: string;
  content_type?: string;
  language?: string;
  release_year?: number;
  imdb_rating?: number;
  poster_url?: string;
  director?: string;
  overview?: string;
}

export type RecommendationSource = "redis_live" | "offline_cf_fallback";

export interface RecommendationsResponse {
  user_id: string;
  source: RecommendationSource;
  recommendations: Recommendation[];
}

export interface HealthResponse {
  status: string;
  offline_cf_loaded: boolean;
  movie_metadata_loaded: boolean;
  user_directory_loaded: boolean;
  redis_connected: boolean;
}
