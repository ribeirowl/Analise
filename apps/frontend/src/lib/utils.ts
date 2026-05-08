import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(utcDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(utcDate));
}

export function formatTime(utcDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(utcDate));
}

export function formatOdd(odd: number | null): string {
  if (odd === null) return "—";
  return odd.toFixed(2);
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function edgeColor(edge: number): string {
  if (edge >= 0.12) return "text-green-400";
  if (edge >= 0.08) return "text-yellow-400";
  return "text-blue-400";
}

export function confidenceBadge(confidence: "low" | "medium" | "high"): string {
  const map = { low: "bg-blue-900 text-blue-300", medium: "bg-yellow-900 text-yellow-300", high: "bg-green-900 text-green-300" };
  return map[confidence];
}
