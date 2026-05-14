"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { TeamSeasonStats } from "@analise-futebol/shared";

interface Props {
  home: TeamSeasonStats;
  away: TeamSeasonStats;
  homeColor?: string;
  awayColor?: string;
}

export default function StatsChart({ home, away, homeColor = "#22c55e", awayColor = "#3b82f6" }: Props) {
  const gp_h = home.gamesPlayed ?? 1;
  const gp_a = away.gamesPlayed ?? 1;

  const data = [
    {
      stat: "Gols/jogo",
      home: (home.avgGoalsFor ?? (home.goalsScored ?? 0) / gp_h).toFixed(2),
      away: (away.avgGoalsFor ?? (away.goalsScored ?? 0) / gp_a).toFixed(2),
    },
    {
      stat: "Sofre/jogo",
      home: (home.avgGoalsAgainst ?? (home.goalsConceded ?? 0) / gp_h).toFixed(2),
      away: (away.avgGoalsAgainst ?? (away.goalsConceded ?? 0) / gp_a).toFixed(2),
    },
    {
      stat: "Gols em casa/jogo",
      home: home.homeAvgGoalsFor?.toFixed(2) ?? "—",
      away: away.homeAvgGoalsFor?.toFixed(2) ?? "—",
    },
    {
      stat: "Gols fora/jogo",
      home: home.awayAvgGoalsFor?.toFixed(2) ?? "—",
      away: away.awayAvgGoalsFor?.toFixed(2) ?? "—",
    },
    {
      stat: "CS total",
      home: home.cleanSheets ?? 0,
      away: away.cleanSheets ?? 0,
    },
  ].filter((d) => d.home !== "—" && d.away !== "—");

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="stat" tick={{ fill: "#64748b", fontSize: 11 }} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
        <Bar dataKey="home" name={home.teamName} fill={homeColor} radius={[3, 3, 0, 0]} />
        <Bar dataKey="away" name={away.teamName} fill={awayColor} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
