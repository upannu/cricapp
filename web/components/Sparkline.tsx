// No charting library exists in this app — a sparkline is simple enough to
// render directly as an SVG polyline rather than pulling in a dependency.

interface Props {
  values: number[];
  height?: number;
  color?: string;
  min?: number;
  max?: number;
}

export function Sparkline({ values, height = 32, color = "#00D4AA", min, max }: Props) {
  if (values.length === 0) return null;
  const width = Math.max(60, values.length * 14);
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const range = hi - lo || 1;

  const coords = values.map((v, i) => ({
    x: (i / Math.max(1, values.length - 1)) * width,
    y: height - ((v - lo) / range) * (height - 6) - 3,
  }));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible flex-shrink-0">
      <polyline
        points={coords.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
      ))}
    </svg>
  );
}
