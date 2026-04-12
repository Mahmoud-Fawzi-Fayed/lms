'use client';

export function MiniBarChart({
  data,
  color = 'bg-primary-500',
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const width = Math.max(6, Math.round((item.value / max) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-accent-600">
              <span>{item.label}</span>
              <span className="font-semibold text-accent-800">{item.value}</span>
            </div>
            <div className="h-2 bg-accent-100 rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MiniLineChart({
  data,
  stroke = '#0ea5e9',
}: {
  data: { label: string; value: number }[];
  stroke?: string;
}) {
  const width = 560;
  const height = 180;
  const padding = 20;
  const max = Math.max(...data.map((d) => d.value), 1);

  const points = data
    .map((d, i) => {
      const x = padding + (i * (width - padding * 2)) / Math.max(data.length - 1, 1);
      const y = height - padding - (d.value / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
        <polyline fill="none" stroke={stroke} strokeWidth="3" points={points} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = padding + (i * (width - padding * 2)) / Math.max(data.length - 1, 1);
          const y = height - padding - (d.value / max) * (height - padding * 2);
          return <circle key={d.label} cx={x} cy={y} r="4" fill={stroke} />;
        })}
      </svg>
      <div className="grid grid-cols-6 gap-2 text-[11px] text-accent-500 mt-2">
        {data.map((d) => (
          <div key={d.label} className="text-center truncate">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
