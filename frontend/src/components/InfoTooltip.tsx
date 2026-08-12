import { useRef, type ReactNode } from "react";

interface InfoTooltipProps {
  label: string;
  children: ReactNode;
}

const VIEWPORT_MARGIN = 16;

export function InfoTooltip({ label, children }: InfoTooltipProps) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  function reposition() {
    const icon = iconRef.current;
    const bubble = bubbleRef.current;
    if (!icon || !bubble) return;

    const iconRect = icon.getBoundingClientRect();
    const bubbleWidth = bubble.offsetWidth;
    let offset = 0;

    const overflowRight = iconRect.left + bubbleWidth - (window.innerWidth - VIEWPORT_MARGIN);
    if (overflowRight > 0) offset -= overflowRight;

    const minOffset = VIEWPORT_MARGIN - iconRect.left;
    if (offset < minOffset) offset = minOffset;

    bubble.style.left = `${offset}px`;
  }

  return (
    <span
      ref={iconRef}
      className="info-tooltip"
      tabIndex={0}
      aria-label={label}
      onMouseEnter={reposition}
      onFocus={reposition}
    >
      <span className="info-tooltip-glyph" aria-hidden="true">i</span>
      <span ref={bubbleRef} className="info-tooltip-bubble" role="tooltip">
        {children}
      </span>
    </span>
  );
}
