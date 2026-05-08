import { notFound } from "next/navigation";

// Teams page is minimal in v1 — fetched via backend when needed
export default async function TeamPage({ params }: { params: { id: string } }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  let team: { name: string; shortName?: string; crest?: string } | null = null;
  try {
    const res = await fetch(`${apiUrl}/api/teams/${params.id}`, { next: { revalidate: 3600 } });
    if (!res.ok) notFound();
    const body = await res.json();
    team = body.data;
  } catch {
    notFound();
  }

  if (!team) notFound();

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-4">
        {team.crest && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.crest} alt={team.name} className="h-16 w-16 object-contain" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          {team.shortName && <p className="text-muted">{team.shortName}</p>}
        </div>
      </div>
      <div className="card text-sm text-muted text-center py-8">
        Estatísticas detalhadas disponíveis na página de cada jogo.
      </div>
    </div>
  );
}
