import type { ErrorTag, Evaluation, PracticeAttempt } from "../../features/english/types";
import type { ThemeColors } from "../../types";

export const ERROR_LABELS: Record<ErrorTag, string> = {
  meaning: "词义",
  grammar: "语法",
  word_order: "语序",
  collocation: "搭配",
  naturalness: "自然度",
};

export const RADAR_DIMS: Array<{ key: ErrorTag; label: string }> = [
  { key: "meaning", label: "词义" },
  { key: "grammar", label: "语法" },
  { key: "word_order", label: "语序" },
  { key: "collocation", label: "搭配" },
  { key: "naturalness", label: "自然度" },
];

export function computeDimensionScores(evaluation: Evaluation): Record<ErrorTag, number> {
  const base = Math.max(40, evaluation.score);
  const dims: Record<ErrorTag, number> = {
    meaning: base,
    grammar: base,
    word_order: base,
    collocation: base,
    naturalness: base,
  };
  for (const issue of evaluation.issues) {
    if (dims[issue.category] !== undefined) {
      dims[issue.category] = Math.max(25, dims[issue.category] - 25);
    }
  }
  for (const key of Object.keys(dims) as ErrorTag[]) {
    if (!evaluation.issues.some((i) => i.category === key)) {
      dims[key] = Math.min(100, Math.max(dims[key], evaluation.verdict === "acceptable" ? Math.max(base, 92) : base));
    }
  }
  return dims;
}

export function computeAggregateDimensions(attempts: PracticeAttempt[]): Record<ErrorTag, number> {
  if (attempts.length === 0) {
    return { meaning: 85, grammar: 85, word_order: 85, collocation: 85, naturalness: 85 };
  }
  const totals: Record<ErrorTag, number> = { meaning: 0, grammar: 0, word_order: 0, collocation: 0, naturalness: 0 };
  for (const attempt of attempts) {
    const d = computeDimensionScores(attempt.evaluation);
    for (const key of Object.keys(totals) as ErrorTag[]) {
      totals[key] += d[key];
    }
  }
  const res = {} as Record<ErrorTag, number>;
  for (const key of Object.keys(totals) as ErrorTag[]) {
    res[key] = Math.round(totals[key] / attempts.length);
  }
  return res;
}

export function RadarChart5D({ scores, c, size = 220 }: { scores: Record<ErrorTag, number>; c: ThemeColors; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const numAxes = RADAR_DIMS.length;

  const angles = RADAR_DIMS.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / numAxes);
  const levels = [0.25, 0.5, 0.75, 1.0];
  const gridPolygons = levels.map((lvl) =>
    angles.map((ang) => `${cx + r * lvl * Math.cos(ang)},${cy + r * lvl * Math.sin(ang)}`).join(" "),
  );

  const dataPoints = RADAR_DIMS.map((dim, i) => {
    const sc = Math.max(15, Math.min(100, scores[dim.key] ?? 70));
    const rad = (sc / 100) * r;
    return {
      x: cx + rad * Math.cos(angles[i]),
      y: cy + rad * Math.sin(angles[i]),
      dim,
      score: sc,
    };
  });
  const dataPolyStr = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="relative inline-flex flex-col items-center select-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        <defs>
          <radialGradient id="radarFillGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={c.accent} stopOpacity="0.45" />
            <stop offset="100%" stopColor={c.accent} stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {gridPolygons.map((poly, idx) => (
          <polygon
            key={idx}
            points={poly}
            fill={idx === levels.length - 1 ? "var(--accent-soft)" : "none"}
            stroke="var(--border-subtle)"
            strokeWidth={1}
            strokeDasharray={idx < levels.length - 1 ? "2,2" : undefined}
          />
        ))}

        {angles.map((ang, idx) => (
          <line
            key={idx}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(ang)}
            y2={cy + r * Math.sin(ang)}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
        ))}

        <polygon
          points={dataPolyStr}
          fill="url(#radarFillGrad)"
          stroke={c.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          style={{ transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />

        {dataPoints.map((pt, idx) => (
          <circle
            key={idx}
            cx={pt.x}
            cy={pt.y}
            r={3.5}
            fill={c.accent}
            stroke={c.card}
            strokeWidth={1.5}
            style={{ transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        ))}

        {angles.map((ang, idx) => {
          const labelDist = r + 20;
          const lx = cx + labelDist * Math.cos(ang);
          const ly = cy + labelDist * Math.sin(ang);
          const dim = RADAR_DIMS[idx];
          const sc = scores[dim.key] ?? 70;
          return (
            <text
              key={idx}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fontWeight={500}
              fill="var(--text-secondary)"
            >
              {dim.label} {sc}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function ScoreGauge({ score, color }: { score: number; color: string }) {
  const size = 116;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center zen-count-up" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`${color}18`} strokeWidth={8} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="type-display" style={{ color, lineHeight: 1 }}>{score}%</span>
        <span className="type-caption mt-1 font-medium opacity-60">正确率</span>
      </div>
    </div>
  );
}
