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
      <span className="status-pill border-rose-400/20 text-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        API unreachable
      </span>
    );
  }

  if (!health) return null;

  const liveOk = health.redis_connected;

  return (
    <span
      className={`status-pill ${
        liveOk ? "border-emerald-400/20 text-emerald-300" : "border-amber-300/20 text-amber-200"
      }`}
      title={
        liveOk
          ? "Redis is connected — live streaming recommendations available"
          : "Redis not connected — serving offline recommendations only"
      }
    >
      <span className={`status-dot ${liveOk ? "bg-emerald-400" : "bg-amber-300"}`} />
      <span className="hidden sm:inline">{liveOk ? "Live intelligence" : "Offline intelligence"}</span>
      <span className="sm:hidden">{liveOk ? "Live" : "Offline"}</span>
    </span>
  );
}
