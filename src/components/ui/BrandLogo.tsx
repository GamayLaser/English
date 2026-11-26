export default function BrandLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        width="32"
        height="32"
        rx="8"
        fill="var(--accent-primary)"
      />
      {/* Three cadence rhythm bars */}
      <rect x="8.5" y="12" width="2.8" height="9.5" rx="1.4" fill="var(--accent-on-primary)" />
      <rect x="14.6" y="7.5" width="2.8" height="14" rx="1.4" fill="var(--accent-on-primary)" />
      <rect x="20.7" y="10.5" width="2.8" height="11" rx="1.4" fill="var(--accent-on-primary)" />
      {/* Subtle open-book spine arc underneath */}
      <path
        d="M7.5 24.2C11.2 22.8 14.2 22.8 16 24.4C17.8 22.8 20.8 22.8 24.5 24.2"
        stroke="var(--accent-on-primary)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.88"
      />
      {/* Warm terracotta / amber accent dot */}
      <circle cx="22.1" cy="7.4" r="1.7" fill="var(--accent-secondary)" />
    </svg>
  );
}
