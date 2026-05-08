"use client";
import { useState, useMemo } from "react";
import { useMatches } from "@/hooks/useMatches";
import MatchCard from "@/components/MatchCard";
import FilterBar from "@/components/FilterBar";
import { MatchCardSkeleton } from "@/components/Skeleton";
import type { EnrichedMatch } from "@analise-futebol/shared";

export default function HomePage() {
  const { data: matches, isLoading, error } = useMatches();
  const [filterCompetition, setFilterCompetition] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyValue, setOnlyValue] = useState(false);

  const competitions = useMemo(() => {
    const set = new Set(matches?.map((m) => m.competition.name) ?? []);
    return Array.from(set).sort();
  }, [matches]);

  const filtered = useMemo<EnrichedMatch[]>(() => {
    if (!matches) return [];
    return matches.filter((m) => {
      if (filterCompetition !== "all" && m.competition.name !== filterCompetition) return false;
      if (onlyValue && (!m.valuePicks || m.valuePicks.length === 0)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !m.homeTeam.name.toLowerCase().includes(q) &&
          !m.awayTeam.name.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [matches, filterCompetition, searchQuery, onlyValue]);

  const byCompetition = useMemo(() => {
    return filtered.reduce<Record<string, EnrichedMatch[]>>((acc, m) => {
      const k = m.competition.name;
      if (!acc[k]) acc[k] = [];
      acc[k].push(m);
      return acc;
    }, {});
  }, [filtered]);

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold capitalize">{today}</h1>
        <p className="text-muted text-sm mt-1">
          {isLoading ? "Carregando..." : `${matches?.length ?? 0} jogos encontrados`}
        </p>
      </div>

      <FilterBar
        competitions={competitions}
        filterCompetition={filterCompetition}
        searchQuery={searchQuery}
        onlyValue={onlyValue}
        onCompetitionChange={setFilterCompetition}
        onSearchChange={setSearchQuery}
        onValueToggle={setOnlyValue}
        matchCount={filtered.length}
      />

      {error && (
        <div className="card text-danger text-sm">
          Erro ao carregar jogos. Verifique se o backend está rodando em localhost:3001.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <MatchCardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && !error && (
        <div className="card text-center py-12 text-muted">
          {searchQuery || filterCompetition !== "all" || onlyValue
            ? "Nenhum jogo encontrado com esses filtros."
            : "Nenhum jogo encontrado para hoje."}
        </div>
      )}

      {Object.entries(byCompetition).map(([competition, compMatches]) => (
        <section key={competition}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3 flex items-center gap-2">
            {compMatches[0].competition.emblem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={compMatches[0].competition.emblem} alt="" className="h-4 w-4 object-contain" />
            )}
            {competition}
            <span className="text-xs font-normal">({compMatches.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {compMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
