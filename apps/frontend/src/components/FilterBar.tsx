"use client";
import { Search, Filter, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  competitions: string[];
  filterCompetition: string;
  searchQuery: string;
  onlyValue: boolean;
  onCompetitionChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onValueToggle: (v: boolean) => void;
  matchCount: number;
}

export default function FilterBar({
  competitions, filterCompetition, searchQuery, onlyValue,
  onCompetitionChange, onSearchChange, onValueToggle, matchCount,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3 items-center mb-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="text"
          placeholder="Buscar time..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-4 py-2 bg-surface border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-muted focus:outline-none focus:border-accent w-48"
        />
      </div>

      {/* Competition filter */}
      <div className="relative">
        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <select
          value={filterCompetition}
          onChange={(e) => onCompetitionChange(e.target.value)}
          className="pl-9 pr-8 py-2 bg-surface border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-accent appearance-none cursor-pointer"
        >
          <option value="all">Todas as competições</option>
          {competitions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Value only toggle */}
      <button
        onClick={() => onValueToggle(!onlyValue)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
          onlyValue
            ? "bg-accent/20 border-accent text-accent"
            : "bg-surface border-slate-700 text-muted hover:text-slate-100"
        )}
      >
        <TrendingUp className="h-4 w-4" />
        Com value pick
      </button>

      {/* Count */}
      <span className="text-sm text-muted ml-auto">
        {matchCount} jogo{matchCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
