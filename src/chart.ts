import type { WorkoutEntry, BodyweightEntry } from "./db";

function lineChartUrl(labels: string[], data: number[], label: string, color: string): string {
  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color.replace(")", ", 0.12)").replace("rgb", "rgba"),
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: color,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      plugins: { legend: { labels: { color: "#e2e8f0" } } },
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

export function progressChartUrl(entries: WorkoutEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  return lineChartUrl(
    sorted.map((e) => e.date.slice(5)),
    sorted.map((e) => e.weightKg),
    sorted[0]?.exercise ?? "",
    "rgb(59,130,246)"
  );
}

export function bodyweightChartUrl(entries: BodyweightEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  return lineChartUrl(
    sorted.map((e) => e.date.slice(5)),
    sorted.map((e) => e.weightKg),
    "Вес тела, кг",
    "rgb(16,185,129)"
  );
}
