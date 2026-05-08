import type { EnrichedMatch, MatchOdds, ValuePick, ApiResponse } from "@analise-futebol/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API error ${res.status} — ${path}`);
  return res.json();
}

export async function fetchTodayMatches(date?: string): Promise<EnrichedMatch[]> {
  const q = date ? `?date=${date}` : "";
  const body = await get<ApiResponse<EnrichedMatch[]>>(`/api/matches/today${q}`);
  return body.data;
}

export async function fetchMatch(id: string): Promise<EnrichedMatch> {
  const body = await get<ApiResponse<EnrichedMatch>>(`/api/matches/${id}`);
  return body.data;
}

export async function fetchMatchOdds(id: string): Promise<MatchOdds | null> {
  const body = await get<{ data: MatchOdds | null }>(`/api/odds/match/${id}`);
  return body.data;
}

export async function fetchValuePicks(): Promise<ValuePick[]> {
  const body = await get<{ data: ValuePick[] }>(`/api/value/today`);
  return body.data;
}

export async function fetchHealth() {
  return get<unknown>(`/api/health`);
}
