export interface ActivityChartDay {
  date: string;
  xp: number;
  goal: number;
}

export interface ActivityChartProps {
  days: ActivityChartDay[];
}

const BAR_WIDTH = 16;
const BAR_GAP = 4;
const MAX_BAR_HEIGHT = 48;
const VIEWBOX_HEIGHT = 60;

/**
 * Pure inline-SVG activity chart — no chart library. One bar per day, scaled against the day with
 * the most XP in the window; goal-met days render green, the rest zinc. A per-bar <title> gives an
 * accessible tooltip (date + XP) without any extra markup. Server-safe (no hooks, no "use client").
 */
export function ActivityChart({ days }: ActivityChartProps) {
  const maxXp = Math.max(1, ...days.map((d) => d.xp));

  return (
    <svg viewBox={`0 0 280 ${VIEWBOX_HEIGHT}`} className="w-full text-zinc-300 dark:text-zinc-600" role="img">
      {days.map((d, i) => {
        const height = Math.min(MAX_BAR_HEIGHT, (d.xp / maxXp) * MAX_BAR_HEIGHT);
        const goalMet = d.goal > 0 && d.xp >= d.goal;
        return (
          <rect
            key={d.date}
            x={i * (BAR_WIDTH + BAR_GAP)}
            y={VIEWBOX_HEIGHT - height}
            width={BAR_WIDTH}
            height={height}
            data-goal-met={goalMet}
            fill="currentColor"
            className={goalMet ? "text-green-500 dark:text-green-400" : ""}
          >
            <title>{`${d.date}: ${d.xp} XP`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
