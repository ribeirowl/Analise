import type { MatchOdds } from "@analise-futebol/shared";
import { formatOdd } from "@/lib/utils";

export default function OddsTable({ odds }: { odds: MatchOdds }) {
  if (!odds || odds.bookmakers.length === 0) {
    return <p className="text-sm text-muted">Odds não disponíveis</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b">
            <th className="pb-2 pr-4 font-medium">Casa</th>
            <th className="pb-2 px-3 font-medium text-center">1</th>
            <th className="pb-2 px-3 font-medium text-center">X</th>
            <th className="pb-2 px-3 font-medium text-center">2</th>
            <th className="pb-2 px-3 font-medium text-center">+2.5</th>
            <th className="pb-2 px-3 font-medium text-center">-2.5</th>
            <th className="pb-2 px-3 font-medium text-center">BTTS S</th>
            <th className="pb-2 px-3 font-medium text-center">BTTS N</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {odds.bookmakers.map((bm) => (
            <tr key={bm.bookmaker} className="hover:bg-surface-2/50">
              <td className="py-2 pr-4 font-medium text-slate-200">{bm.bookmaker}</td>
              <td className="py-2 px-3 text-center">{formatOdd(bm.home)}</td>
              <td className="py-2 px-3 text-center">{formatOdd(bm.draw)}</td>
              <td className="py-2 px-3 text-center">{formatOdd(bm.away)}</td>
              <td className="py-2 px-3 text-center">{formatOdd(bm.over25)}</td>
              <td className="py-2 px-3 text-center">{formatOdd(bm.under25)}</td>
              <td className="py-2 px-3 text-center">{formatOdd(bm.btts_yes)}</td>
              <td className="py-2 px-3 text-center">{formatOdd(bm.btts_no)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
