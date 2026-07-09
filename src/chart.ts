import type { WorkoutEntry } from "./db";

export function progressChartUrl(entries: WorkoutEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  const labels = sorted.map((e) => e.date.slice(5)); // MM-DD
  const data = sorted.map((e) => e.weightKg);

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: sorted[0]?.exercise ?? "",
        data,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.1)",
        borderWidth: 2,
        pointRadius: 4,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
      },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
      },
      layout: { padding: 10 },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?w=600&h=300&bkg=%230f172a&c=${encoded}`;
}
