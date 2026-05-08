export default function Disclaimer() {
  return (
    <footer className="mt-16 border-t border-slate-700/50 bg-surface/50">
      <div className="container mx-auto max-w-7xl px-4 py-6 text-center text-xs text-muted">
        <p>
          ⚠️ <strong>Análise estatística baseada em dados públicos. Não é recomendação de aposta.</strong>
        </p>
        <p className="mt-1">
          18+ · Aposte com responsabilidade · Jogo responsável:{" "}
          <a href="https://www.jogoresponsavel.pt" className="underline hover:text-slate-100" target="_blank" rel="noopener noreferrer">
            jogoresponsavel.pt
          </a>
        </p>
      </div>
    </footer>
  );
}
