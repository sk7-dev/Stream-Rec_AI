import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
