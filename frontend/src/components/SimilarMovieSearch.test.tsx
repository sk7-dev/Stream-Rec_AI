import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SimilarMovieSearch } from "./SimilarMovieSearch";
import { ApiError, getSimilarMovies, searchMovies } from "../api";
import type { MovieSearchItem, SimilarMoviesResponse } from "../types";

vi.mock("../api", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError: MockApiError,
    searchMovies: vi.fn(),
    getSimilarMovies: vi.fn(),
  };
});

const movies: MovieSearchItem[] = [
  { movie_id: "m1", title: "Interstellar", release_year: 2014, genres: ["Adventure", "Drama"] },
  { movie_id: "m2", title: "Arrival", release_year: 2016, genres: ["Drama", "Sci-Fi"] },
  { movie_id: "m3", title: "The Martian", release_year: 2015, genres: ["Adventure"] },
];

const successResponse: SimilarMoviesResponse = {
  seed_movies: [movies[0]],
  source: "offline_content_similarity",
  recommendations: [{
    movie_id: "result-1",
    title: "Moon",
    release_year: 2009,
    genres: ["Drama", "Mystery"],
    genre_primary: "Drama",
    language: "English",
    imdb_rating: 8.2,
    similarity_score: 0.91,
    match_reasons: ["Shared genres: Drama", "Same language: English"],
    rank: 1,
    source: "offline_content_similarity",
  }],
};

async function searchAndSelect(title: string, result: MovieSearchItem) {
  const input = screen.getByRole("combobox", { name: /search the movie catalog/i });
  await userEvent.clear(input);
  await userEvent.type(input, title);
  await userEvent.click(await screen.findByRole("option", { name: new RegExp(result.title, "i") }));
}

describe("SimilarMovieSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchMovies).mockImplementation(async (query) => ({
      query,
      results: movies.filter((movie) => movie.title.toLowerCase().includes(query.toLowerCase())),
    }));
  });

  it("starts with an accessible empty state and disabled primary action", () => {
    render(<SimilarMovieSearch />);
    expect(screen.getByRole("combobox", { name: /search the movie catalog/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /find similar movies/i })).toBeDisabled();
    expect(screen.getByText(/choose 1–3 movies to begin/i)).toBeInTheDocument();
    expect(screen.getByText(/your movie matches will appear here/i)).toBeInTheDocument();
  });

  it("searches, selects, prevents duplicates, removes, clears, and enforces three maximum", async () => {
    render(<SimilarMovieSearch />);

    await searchAndSelect("Inter", movies[0]);
    expect(screen.getByText("Interstellar")).toBeInTheDocument();
    expect(screen.getByText("2014")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /find similar movies/i })).toBeEnabled();

    const input = screen.getByRole("combobox", { name: /search the movie catalog/i });
    await userEvent.type(input, "Inter");
    expect(await screen.findByText(/no matching movies found/i)).toBeInTheDocument();
    await userEvent.clear(input);

    await searchAndSelect("Arrival", movies[1]);
    await searchAndSelect("Martian", movies[2]);
    expect(screen.getByRole("combobox")).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /remove arrival/i }));
    expect(screen.getByRole("combobox")).toBeEnabled();
    expect(screen.queryByText("Arrival")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getByText(/choose 1–3 movies to begin/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /find similar movies/i })).toBeDisabled();
  });

  it("supports keyboard selection and Escape closes the autocomplete", async () => {
    render(<SimilarMovieSearch />);
    const input = screen.getByRole("combobox", { name: /search the movie catalog/i });
    await userEvent.type(input, "Inter");
    await screen.findByRole("option", { name: /interstellar/i });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByText("Interstellar")).toBeInTheDocument();

    await userEvent.type(input, "Arrival");
    expect(await screen.findByRole("option", { name: /arrival/i })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("option", { name: /arrival/i })).not.toBeInTheDocument();
  });

  it("renders stable loading, success, and visually distinct score labels", async () => {
    let resolveRequest: (value: SimilarMoviesResponse) => void = () => undefined;
    vi.mocked(getSimilarMovies).mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<SimilarMovieSearch />);
    await searchAndSelect("Inter", movies[0]);

    await userEvent.click(screen.getByRole("button", { name: /find similar movies/i }));
    expect(screen.getByLabelText(/finding similar movies/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finding matches/i })).toBeDisabled();

    resolveRequest(successResponse);
    expect(await screen.findByText("91% match")).toBeInTheDocument();
    expect(screen.getByLabelText("IMDb rating 8.2")).toBeInTheDocument();
    expect(screen.getByText("Shared genres: Drama")).toBeInTheDocument();
    expect(screen.getByText(/more match details/i)).toBeInTheDocument();
  });

  it("renders API errors and clears stale results when selection changes", async () => {
    vi.mocked(getSimilarMovies)
      .mockResolvedValueOnce(successResponse)
      .mockRejectedValueOnce(new ApiError(503, "The offline recommendation model is unavailable."));
    render(<SimilarMovieSearch />);
    await searchAndSelect("Inter", movies[0]);
    await userEvent.click(screen.getByRole("button", { name: /find similar movies/i }));
    expect(await screen.findByText("91% match")).toBeInTheDocument();

    await searchAndSelect("Arrival", movies[1]);
    expect(screen.queryByText("91% match")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /find similar movies/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/model is unavailable/i));
  });
});
