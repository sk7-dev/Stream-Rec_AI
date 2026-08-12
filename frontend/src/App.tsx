import { useRef, useState } from "react";
import { ApiError, getRecommendations } from "./api";
import { HealthBadge } from "./components/HealthBadge";
import { InfinitePosterBackground } from "./components/InfinitePosterBackground";
import { MovieModeSwitcher, type RecommendationMode } from "./components/MovieModeSwitcher";
import { RecommendationsGrid } from "./components/RecommendationsGrid";
import { SimilarMovieSearch } from "./components/SimilarMovieSearch";
import { UserSearch } from "./components/UserSearch";
import type { RecommendationsResponse, UserSummary } from "./types";

function viewerName(user: UserSummary | null) {
  if (!user) return "";
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.user_id;
}

function App() {
  const [mode, setMode] = useState<RecommendationMode>("similar");
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<RecommendationMode, number>>({ personalized: 0, similar: 0 });
  const isCompactPersonalized = Boolean(data && data.recommendations.length > 0);

  function handleModeChange(nextMode: RecommendationMode) {
    if (nextMode === mode) return;
    if (scrollAreaRef.current) scrollPositions.current[mode] = scrollAreaRef.current.scrollTop;
    setMode(nextMode);
    requestAnimationFrame(() => {
      const scrollArea = scrollAreaRef.current;
      if (!scrollArea) return;
      if (typeof scrollArea.scrollTo === "function") {
        scrollArea.scrollTo({ top: scrollPositions.current[nextMode] });
      } else {
        scrollArea.scrollTop = scrollPositions.current[nextMode];
      }
    });
  }

  async function handleSelectUser(user: UserSummary) {
    setSelectedUser(user);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      setData(await getRecommendations(user.user_id));
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "We couldn’t load recommendations. Please try again in a moment.",
      );
    } finally {
      setLoading(false);
    }
  }

  function clearSelectedUser() {
    setSelectedUser(null);
    setData(null);
    setError(null);
  }

  return (
    <div className="app-viewport">
      <InfinitePosterBackground />
      <div className="background-overlay" aria-hidden="true" />

      <main className="single-screen-shell">
        <aside className="brand-story-panel" aria-labelledby="brand-story-heading">
          <div className="brand-panel-glow" aria-hidden="true" />
          <div className="streamrec-logo" aria-label="Stream-Rec AI">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="logo-icon">
              <path d="M8.1 5.1a1.1 1.1 0 0 1 1.67-.93l10 6.15a1.1 1.1 0 0 1 0 1.87l-10 6.15a1.1 1.1 0 0 1-1.67-.94V5.1Z" />
              <path d="M4 7v10" />
            </svg>
            <span className="logo-stream">Stream</span><span className="logo-rec">Rec</span>
          </div>

          <div className="brand-story-copy">
            <p className="brand-eyebrow">Your next watch starts here.</p>
            <h1 id="brand-story-heading">
              Movies you’ll love.
              <span>Picked for you.</span>
            </h1>
            <p className="brand-summary">
              Personalized recommendations powered by what you watch or start with a movie you
              already love and discover something new.
            </p>
          </div>

          <div className="capability-list" aria-label="Recommendation capabilities">
            <span>Personalized recommendations</span>
            <span>Content-based discovery</span>
            <span>Real-time + offline</span>
          </div>
        </aside>

        <section className="recommendation-workspace" aria-label="Recommendation workspace">
          <div className="tabs-row">
            <MovieModeSwitcher mode={mode} onChange={handleModeChange} />
            <HealthBadge />
          </div>

          <div ref={scrollAreaRef} className="workspace-scroll-area" tabIndex={0}>
            <section id="personalized-panel" role="tabpanel" aria-labelledby="personalized-tab" hidden={mode !== "personalized"} className="mode-panel">
              <div className={`workflow-card ${isCompactPersonalized ? "workflow-card--compact" : ""}`}>
                <div className="workflow-heading">
                  <p className="section-kicker">
                    For you
                    <span className="info-tooltip" tabIndex={0} aria-label="For You demonstration notice">
                      <span className="info-tooltip-glyph" aria-hidden="true">i</span>
                      <span className="info-tooltip-bubble" role="tooltip">
                        <strong>Demonstration environment.</strong> In production, this experience is
                        designed to learn from live streaming activity and refresh recommendations
                        continuously. This version uses representative sample data to demonstrate the
                        end-to-end experience.
                      </span>
                    </span>
                  </p>
                  <div className={`workflow-heading-collapse ${isCompactPersonalized ? "is-collapsed" : ""}`}>
                    <div className="workflow-heading-collapse-inner">
                      <h3>Recommendations made for you</h3>
                      <p>Search for a viewer to build personalized suggestions from their history, preferences, and recent activity.</p>
                    </div>
                  </div>
                </div>
                <UserSearch onSelect={handleSelectUser} />
                {selectedUser && (
                  <div className="selected-user-card">
                    <span className="user-avatar" aria-hidden="true">{(selectedUser.first_name?.[0] ?? selectedUser.user_id[0] ?? "U").toUpperCase()}</span>
                    <span className="selected-user-copy">
                      <strong>{viewerName(selectedUser)}</strong>
                      <span>{[selectedUser.email, selectedUser.user_id].filter(Boolean).join(" · ")}</span>
                    </span>
                    <button type="button" className="ghost-button" onClick={clearSelectedUser}>Change</button>
                  </div>
                )}
              </div>
              <RecommendationsGrid data={data} loading={loading} error={error} viewerName={viewerName(selectedUser)} />
            </section>

            <section id="similar-panel" role="tabpanel" aria-labelledby="similar-tab" hidden={mode !== "similar"} className="mode-panel">
              <SimilarMovieSearch />
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
