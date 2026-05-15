export function AppMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ width: "100%", height: "100%", display: "block", ...style }}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M13 4l-4 8h5l-4 8" />
    </svg>
  );
}
