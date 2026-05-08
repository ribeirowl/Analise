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
    { stat: "Gols/jogo", home: ((home.goalsScored ?? 0) / gp_h).toFixed(2), away: ((away.goalsScored ?? 0) / gp_a).toFixed(2) },
    { stat: "Gols sofridos", home: ((home.goalsConceded ?? 0) / gp_h).toFixed(2), away: ((away.goalsConceded ?? 0) / gp_a).toFixed(2) },
    { stat: "Chutes a gol", home: home.avgShotsFor?.toFixed(1) ?? 0, away: away.avgShotsFor?.toFixed(1) ?? 0 },
    { stat: "Posse (%)", home: home.avgPossession?.toFixed(0) ?? 0, away: away.avgPossession?.toFixed(0) ?? 0 },
    { stat: "Escanteios", home: home.avgCorners?.toFixed(1) ?? 0, away: away.avgCorners?.toFixed(1) ?? 0 },
    { stat: "Faltas", home: home.avgFoulsCommitted?.toFixed(1) ?? 0, away: away.avgFoulsCommitted?.toFixed(1) ?? 0 },
  ];

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
