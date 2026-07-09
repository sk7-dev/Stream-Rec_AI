import { useState } from "react";
import { ApiError, getRecommendations } from "./api";
import { HealthBadge } from "./components/HealthBadge";
import { RecommendationsGrid } from "./components/RecommendationsGrid";
import { UserSearch } from "./components/UserSearch";
import type { RecommendationsResponse, UserSummary } from "./types";

function App() {
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectUser(user: UserSummary) {
    setSelectedUser(user);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await getRecommendations(user.user_id);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Movie Recommendations
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Hybrid real-time + offline collaborative filtering
          </p>
        </div>
        <HealthBadge />
      </header>

      <div className="mb-8">
        <UserSearch onSelect={handleSelectUser} />
        {selectedUser && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Selected: {selectedUser.first_name} {selectedUser.last_name} ({selectedUser.user_id})
          </p>
        )}
      </div>

      <RecommendationsGrid data={data} loading={loading} error={error} />
    </div>
  );
}

export default App;
