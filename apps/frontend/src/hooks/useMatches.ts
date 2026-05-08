"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchTodayMatches, fetchMatch, fetchValuePicks } from "@/lib/api";

export function useMatches(date?: string) {
  return useQuery({
    queryKey: ["matches", "today", date],
    queryFn: () => fetchTodayMatches(date),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useMatchDetail(id: string) {
  return useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchMatch(id),
    staleTime: 5 * 60 * 1000,
  });
}

export function useValuePicks() {
  return useQuery({
    queryKey: ["value-picks"],
    queryFn: fetchValuePicks,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
