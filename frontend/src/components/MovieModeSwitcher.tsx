import { useRef } from "react";

export type RecommendationMode = "personalized" | "similar";

interface MovieModeSwitcherProps {
  mode: RecommendationMode;
  onChange: (mode: RecommendationMode) => void;
}

const MODES: RecommendationMode[] = ["similar", "personalized"];

export function MovieModeSwitcher({ mode, onChange }: MovieModeSwitcherProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % MODES.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + MODES.length) % MODES.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = MODES.length - 1;
    onChange(MODES[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="recommendation-tabs" role="tablist" aria-label="Recommendation mode">
      <button
        ref={(node) => { tabRefs.current[0] = node; }}
        id="similar-tab"
        type="button"
        role="tab"
        aria-selected={mode === "similar"}
        aria-controls="similar-panel"
        tabIndex={mode === "similar" ? 0 : -1}
        onKeyDown={(event) => handleKeyDown(event, 0)}
        onClick={() => onChange("similar")}
        className={`recommendation-tab ${mode === "similar" ? "is-active" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20"><rect x="3" y="4" width="10" height="12" rx="2" /><path d="M7 7h9a1 1 0 0 1 1 1v6" /></svg>
        Similar movies
      </button>
      <button
        ref={(node) => { tabRefs.current[1] = node; }}
        id="personalized-tab"
        type="button"
        role="tab"
        aria-selected={mode === "personalized"}
        aria-controls="personalized-panel"
        tabIndex={mode === "personalized" ? 0 : -1}
        onKeyDown={(event) => handleKeyDown(event, 1)}
        onClick={() => onChange("personalized")}
        className={`recommendation-tab ${mode === "personalized" ? "is-active" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8" cy="6" r="3" /><path d="M2.8 16c.45-3.15 2.2-4.7 5.2-4.7s4.75 1.55 5.2 4.7M15.1 3.2l.42 1.13 1.13.42-1.13.42-.42 1.13-.42-1.13-1.13-.42 1.13-.42.42-1.13Z" /></svg>
        For you
      </button>
    </div>
  );
}
