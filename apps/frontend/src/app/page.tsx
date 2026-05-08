import { fetchTodayMatches } from "@/lib/api";
import MatchCard from "@/components/MatchCard";
import type { EnrichedMatch } from "@analise-futebol/shared";

export const revalidate = 300; // 5 min ISR

export default async function HomePage() {
  let matches: EnrichedMatch[] = [];
  let error: string | null = null;

  try {
    matches = await fetchTodayMatches();
  } catch (err) {
    error = String(err);
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <p className="text-danger mb-2">Erro ao carregar jogos</p>
        <p className="text-sm text-muted">{error}</p>
        <p className="text-xs text-muted mt-4">Verifique se o backend está rodando em localhost:3001</p>
      </div>
    );
  }

  // Group by competition
  const byCompetition = matches.reduce<Record<string, EnrichedMatch[]>>((acc, m) => {
    const key = m.competition.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold capitalize">{today}</h1>
        <p className="text-muted text-sm mt-1">{matches.length} jogo{matches.length !== 1 ? "s" : ""} encontrado{matches.length !== 1 ? "s" : ""}</p>
      </div>

      {matches.length === 0 ? (
        <div className="card text-center py-12 text-muted">
          Nenhum jogo encontrado para hoje.
        </div>
      ) : (
        Object.entries(byCompetition).map(([competition, compMatches]) => (
          <section key={competition}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3 flex items-center gap-2">
              {compMatches[0].competition.emblem && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={compMatches[0].competition.emblem} alt="" className="h-4 w-4 object-contain" />
              )}
              {competition}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {compMatches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
