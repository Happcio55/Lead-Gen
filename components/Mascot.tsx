type Props = {
  awake: boolean;
  className?: string;
  /** Show the floating "z" while asleep. */
  zzz?: boolean;
};

/** Pixel-art monitor. Asleep = idle and earning nothing; awake = working a job. */
export default function Mascot({ awake, className = "h-24 w-24", zzz = true }: Props) {
  return (
    <svg
      viewBox="0 -4 20 18"
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={awake ? "Monitor mascot, awake and working" : "Monitor mascot, asleep"}
    >
      {/* frame with notched corners */}
      <rect x="2" y="0" width="12" height="1" fill="var(--color-frame)" />
      <rect x="1" y="1" width="14" height="10" fill="var(--color-frame)" />
      <rect x="2" y="11" width="12" height="1" fill="var(--color-frame)" />
      {/* screen */}
      <rect x="2" y="1" width="12" height="8" fill={awake ? "#22306b" : "#161b3a"} />
      {awake && <rect x="2" y="1" width="12" height="1" fill="#2c3c80" />}
      {/* power led */}
      <rect x="12" y="10" width="1" height="1" fill={awake ? "var(--color-mint)" : "var(--color-amber)"} />
      {/* stand */}
      <rect x="6" y="12" width="4" height="1" fill="var(--color-frame)" />
      <rect x="4" y="13" width="8" height="1" fill="var(--color-frame)" />

      {awake ? (
        <>
          <g className="animate-blink">
            <rect x="4" y="3" width="2" height="3" fill="var(--color-amber)" />
            <rect x="10" y="3" width="2" height="3" fill="var(--color-amber)" />
            <rect x="4" y="3" width="1" height="1" fill="#fff4d6" />
            <rect x="10" y="3" width="1" height="1" fill="#fff4d6" />
          </g>
          <rect x="5" y="6" width="1" height="1" fill="var(--color-mint)" />
          <rect x="10" y="6" width="1" height="1" fill="var(--color-mint)" />
          <rect x="6" y="7" width="4" height="1" fill="var(--color-mint)" />
        </>
      ) : (
        <>
          <rect x="3" y="5" width="3" height="1" fill="#59608a" />
          <rect x="10" y="5" width="3" height="1" fill="#59608a" />
          <rect x="7" y="7" width="2" height="1" fill="#59608a" />
          {zzz && (
            <>
              <text x="15.5" y="0" fontSize="4" fontWeight="700" fill="var(--color-muted)" className="animate-z">
                z
              </text>
              <text
                x="17.5"
                y="-2"
                fontSize="3"
                fontWeight="700"
                fill="var(--color-muted)"
                className="animate-z"
                style={{ animationDelay: "1.2s" }}
              >
                z
              </text>
            </>
          )}
        </>
      )}
    </svg>
  );
}
