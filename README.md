# Análise Futebol

Site fullstack de análise de futebol com estatísticas e odds em tempo real.

## Stack

- **Backend**: Node.js 20 + Express + TypeScript  
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS  
- **APIs**: football-data.org, Sofascore (não-oficial), The Odds API  

---

## 1. Obter as API Keys

### football-data.org (gratuito)
1. Acesse https://www.football-data.org/client/register
2. Preencha o formulário e confirme o e-mail
3. Sua API key chega por e-mail (formato: `abc123...`)

### The Odds API (500 req/mês grátis)
1. Acesse https://the-odds-api.com/#get-access
2. Preencha o formulário — key aparece imediatamente
3. Monitore o uso pelos headers `x-requests-remaining`

### Sofascore
Não requer key. Use apenas para fins educacionais/pessoais.

---

## 2. Configurar variáveis de ambiente

```bash
# Na raiz do projeto:
cp .env.example apps/backend/.env

# Edite apps/backend/.env e preencha:
FOOTBALL_DATA_API_KEY=sua_key_aqui
ODDS_API_KEY=sua_key_aqui
```

---

## 3. Rodar localmente

```bash
# Instalar dependências (na raiz)
npm install

# Rodar backend e frontend em paralelo
npm run dev
```

- Backend: http://localhost:3001  
- Frontend: http://localhost:3000  
- Health check: http://localhost:3001/api/health  

---

## 4. Deploy

### Backend (Railway ou Render)
1. Crie conta em https://railway.app ou https://render.com
2. Conecte o repositório, selecione a pasta `apps/backend`
3. Configure as variáveis de ambiente no painel
4. Build command: `npm install && npm run build`  
   Start command: `npm start`

### Frontend (Vercel)
1. Crie conta em https://vercel.com
2. Importe o repositório, selecione `apps/frontend` como root
3. Configure `NEXT_PUBLIC_API_URL` apontando para o backend em produção

---

## 5. Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/health` | Status + quota das APIs |
| GET | `/api/matches/today` | Jogos do dia enriquecidos |
| GET | `/api/matches/:id` | Detalhes de um jogo |
| GET | `/api/odds/match/:id` | Odds de um jogo |
| GET | `/api/value/today` | Picks com valor do dia |
| GET | `/api/teams/:id` | Info de um time |

---

## ⚠️ Aviso Legal

**Este projeto é para fins educacionais e de portfolio.**

- Análise estatística baseada em dados públicos
- **Não é recomendação de aposta financeira**
- O uso da API do Sofascore é não-oficial — não distribua os dados
- 18+ · Aposte com responsabilidade
- Se você tem problema com jogo, ligue 0800 722 4050 (ANVISA)

---

## Melhorias futuras (v2)

- [ ] Banco Postgres para histórico de picks e ROI hipotético
- [ ] Login com Supabase Auth para salvar favoritos
- [ ] Gráficos xG vs Gols (scatter plot)
- [ ] Notificações push para picks de alto valor
- [ ] Bot Telegram com picks do dia
- [ ] ML model com StatsBomb open data
