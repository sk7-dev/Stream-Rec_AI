import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { getRecommendations, searchUsers } from "./api";
import type { RecommendationsResponse } from "./types";

vi.mock("./api", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError: MockApiError,
    getHealth: vi.fn().mockResolvedValue({
      status: "ok",
      redis_connected: false,
      offline_cf_loaded: true,
      movie_metadata_loaded: true,
      user_directory_loaded: true,
    }),
    searchUsers: vi.fn(),
    getRecommendations: vi.fn(),
    searchMovies: vi.fn().mockResolvedValue({ query: "", results: [] }),
    getSimilarMovies: vi.fn(),
  };
});

vi.mock("./components/InfinitePosterBackground", () => ({
  InfinitePosterBackground: () => <div data-testid="poster-background" />,
}));

const recommendations: RecommendationsResponse = {
  user_id: "u1",
  source: "offline_cf_fallback",
  recommendations: [{
    movie_id: "m1",
    title: "Arrival",
    rank: 1,
    score: 8.9,
    source: "offline_cf_fallback",
    imdb_rating: 7.9,
  }],
};

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchUsers).mockResolvedValue({
      count: 1,
      users: [{ user_id: "u1", first_name: "Alex", last_name: "Rivera", email: "alex@example.com" }],
    });
    vi.mocked(getRecommendations).mockResolvedValue(recommendations);
  });

  it("renders Stream-Rec AI branding and the preserved poster background", () => {
    render(<App />);
    expect(screen.getByLabelText("Stream-Rec AI")).toBeInTheDocument();
    expect(screen.getByText(/movies you’ll love/i)).toBeInTheDocument();
    expect(screen.getByTestId("poster-background")).toBeInTheDocument();
    expect(screen.queryByText(/MovieRec/i)).not.toBeInTheDocument();
  });

  it("switches tabs with correct semantics and arrow-key navigation", async () => {
    render(<App />);
    const forYou = screen.getByRole("tab", { name: /for you/i });
    const similar = screen.getByRole("tab", { name: /similar movies/i });
    expect(similar).toHaveAttribute("aria-selected", "true");
    expect(forYou).toHaveAttribute("aria-selected", "false");

    similar.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(forYou).toHaveFocus();
    expect(forYou).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: /for you/i })).toBeVisible();

    await userEvent.keyboard("{ArrowLeft}");
    expect(similar).toHaveFocus();
    expect(similar).toHaveAttribute("aria-selected", "true");
  });

  it("searches for a user, selects them, and renders personalized results", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: /for you/i }));
    const input = screen.getByRole("combobox", { name: /find a viewer/i });
    await userEvent.type(input, "Alex");
    await userEvent.click(await screen.findByRole("option", { name: /alex rivera/i }));

    expect(await screen.findByText("Picked for Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Arrival")).toBeInTheDocument();
    expect(screen.getByText("Recommended 8.90")).toBeInTheDocument();
    expect(screen.getByLabelText("IMDb rating 7.9")).toBeInTheDocument();
    expect(getRecommendations).toHaveBeenCalledWith("u1");

    await userEvent.click(screen.getByRole("button", { name: /change/i }));
    expect(screen.getByText(/your recommendations will appear here/i)).toBeInTheDocument();
  });
});
