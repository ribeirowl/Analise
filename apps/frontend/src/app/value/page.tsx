import { fetchValuePicks } from "@/lib/api";
import ValueAlert from "@/components/ValueAlert";
import type { ValuePick } from "@analise-futebol/shared";
import { TrendingUp } from "lucide-react";

export const revalidate = 300;

export default async function ValuePage() {
  let picks: ValuePick[] = [];
  let error: string | null = null;

  try {
    picks = await fetchValuePicks();
  } catch (err) {
    error = String(err);
  }

  const high = picks.filter((p) => p.confidence === "high");
  const medium = picks.filter((p) => p.confidence === "medium");
  const low = picks.filter((p) => p.confidence === "low");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-accent" />
          Picks com Valor
        </h1>
        <p className="text-muted text-sm mt-1">
          Apostas onde a probabilidade estatística supera a odd implícita em pelo menos 5%.
        </p>
      </div>

      {error && (
        <div className="card text-danger text-sm">{error}</div>
      )}

      {picks.length === 0 && !error && (
        <div className="card text-center py-12 text-muted">
          Nenhum pick com valor encontrado hoje.
        </div>
      )}

      {high.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-green-400 font-semibold mb-3">Alta confiança (+12% edge)</h2>
          <div className="space-y-3">
            {high.map((p, i) => <ValueAlert key={i} pick={p} showMatch />)}
          </div>
        </section>
      )}

      {medium.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-yellow-400 font-semibold mb-3">Média confiança (8–12% edge)</h2>
          <div className="space-y-3">
            {medium.map((p, i) => <ValueAlert key={i} pick={p} showMatch />)}
          </div>
        </section>
      )}

      {low.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-blue-400 font-semibold mb-3">Baixa confiança (5–8% edge)</h2>
          <div className="space-y-3">
            {low.map((p, i) => <ValueAlert key={i} pick={p} showMatch />)}
          </div>
        </section>
      )}
    </div>
  );
}
