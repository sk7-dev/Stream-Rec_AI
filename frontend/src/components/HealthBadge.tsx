import { useEffect, useState } from "react";
import { getHealth } from "../api";
import type { HealthResponse } from "../types";

export function HealthBadge() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await getHealth();
        if (!cancelled) {
          setHealth(res);
          setReachable(true);
        }
      } catch {
        if (!cancelled) setReachable(false);
      }
    }

    poll();
    const interval = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!reachable) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        API unreachable
      </span>
    );
  }

  if (!health) return null;

  const liveOk = health.redis_connected;

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        liveOk
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      }`}
      title={
        liveOk
          ? "Redis is connected — live streaming recommendations available"
          : "Redis not connected — serving offline recommendations only"
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${liveOk ? "bg-emerald-500" : "bg-amber-500"}`} />
      {liveOk ? "Live streaming" : "Offline only"}
    </span>
  );
}
