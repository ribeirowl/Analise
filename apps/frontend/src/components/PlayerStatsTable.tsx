import type { PlayerStats } from "@analise-futebol/shared";

export default function PlayerStatsTable({ players, title }: { players: PlayerStats[]; title: string }) {
  if (players.length === 0) return <p className="text-sm text-muted">Dados não disponíveis</p>;

  const sorted = [...players].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 10);

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted mb-3 uppercase tracking-wider">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b text-xs">
              <th className="pb-2 pr-4">Jogador</th>
              <th className="pb-2 px-2 text-center">Rating</th>
              <th className="pb-2 px-2 text-center">Gols</th>
              <th className="pb-2 px-2 text-center">Assist.</th>
              <th className="pb-2 px-2 text-center">Chutes</th>
              <th className="pb-2 px-2 text-center">SoG</th>
              <th className="pb-2 px-2 text-center">Desarm.</th>
              <th className="pb-2 px-2 text-center">xG</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {sorted.map((p) => (
              <tr key={p.playerId} className="hover:bg-surface-2/50">
                <td className="py-2 pr-4 font-medium text-slate-200 whitespace-nowrap">{p.name}</td>
                <td className="py-2 px-2 text-center">{p.rating?.toFixed(1) ?? "—"}</td>
                <td className="py-2 px-2 text-center">{p.goals ?? "—"}</td>
                <td className="py-2 px-2 text-center">{p.assists ?? "—"}</td>
                <td className="py-2 px-2 text-center">{p.totalShots ?? "—"}</td>
                <td className="py-2 px-2 text-center">{p.shotsOnTarget ?? "—"}</td>
                <td className="py-2 px-2 text-center">{p.tackles ?? "—"}</td>
                <td className="py-2 px-2 text-center">{p.expectedGoals?.toFixed(1) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
