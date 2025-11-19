# eSports Chatbot — Next.js + lokální embeddingy

Chatbot nad dokumentací, který načítá data z JSON API, vytváří lokální embeddingy a odpovídá pouze z vašeho obsahu. Podporuje dva režimy: **User** a **Admin**, každý s vlastní knowledge base.

## ✨ Funkce

- **JSON API integrace**: Načítá data z externího JSON API endpointu
- **Dvojí knowledge base**: Separátní indexy pro uživatele (id_type=1) a adminy (id_type=2)
- **Lokální vektorový index**: Embeddingy pomocí `@xenova/transformers`, bez externí DB
- **RAG odpovědi**: Kombinuje vektorové vyhledávání s fallbackem na klíčová slova
- **Citace**: Zobrazuje zdroje informací s relevance score
- **Rate limiting**: Ochrana proti zneužití
- **Veřejné API**: Podpora pro externí integrace

## 🧰 Předpoklady

- Node.js 20+ a npm
- Model pro embeddingy se stáhne automaticky při prvním běhu

## 🚀 Rychlý start

```bash
# 1) Nainstaluj závislosti
npm install

# 2) Nastav proměnné prostředí
cat > .env.local <<'ENV'
ADMIN_KEY=super_secret_key
HELP_API_TOKEN=$1$o7qkoaCQ$g1n1yA7PGHdZj6zvjiPOr.
DOCS_DIR=./docs

# OpenAI pro generování odpovědí
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_INPUT_PRICE_PER_1K=0.00015
OPENAI_OUTPUT_PRICE_PER_1K=0.0006

# Vercel Blob Storage (pro produkci)
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Veřejné API (volitelné)
PUBLIC_API_KEY=your_secret_key_here
RATE_LIMIT_MAX_REQUESTS=20
ENV

# 3) Spusť dev server
npm run dev
```

## 📁 Struktura projektu

```
esports-bot/
├─ app/
│  ├─ page.tsx              # Frontend UI s selectem User/Admin
│  └─ api/
│     ├─ ask/route.ts       # RAG endpoint
│     └─ admin/
│        ├─ sync/route.ts   # Synchronizace z JSON API
│        └─ reindex/route.ts# Vytvoření embeddingů
├─ lib/
│  ├─ jsonApi.ts            # Načítání dat z JSON API
│  ├─ sync.ts               # Synchronizace dat
│  ├─ ingest.ts             # Zpracování a vytvoření indexů
│  ├─ search.ts             # Vektorové vyhledávání
│  ├─ md.ts                 # Dělení textu na chunky
│  └─ localEmbeddings.ts    # Lokální embeddingy
└─ docs/                    # Lokální cache dat a indexů
```

## 🔄 Workflow

### 1. Synchronizace dat

Načte data z JSON API pro user i admin:

```bash
curl -X POST http://localhost:3000/api/admin/sync \
  -H "x-admin-key: super_secret_key"
```

Výstup:

```json
{
  "ok": true,
  "user": {
    "ok": true,
    "downloaded": 12,
    "changedPaths": ["./docs/help-data-user.json"]
  },
  "admin": {
    "ok": true,
    "downloaded": 8,
    "changedPaths": ["./docs/help-data-admin.json"]
  }
}
```

### 2. Vytvoření indexů

Zpracuje data a vytvoří embeddingy:

```bash
curl -X POST "http://localhost:3000/api/admin/reindex?sync=1" \
  -H "x-admin-key: $ADMIN_KEY"
```

Vytvoří separátní indexy:

- `index-user.json` - pro uživatelské dotazy
- `index-admin.json` - pro admin dotazy

### 3. Dotazování

**Frontend**: Otevři `http://localhost:3000` a použij select pro přepínání mezi User/Admin režimem.

**API**:

```bash
# User režim (výchozí)
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Jak resetovat heslo?",
    "includeCitations": true,
    "includeCosts": true,
    "includeMarkdown": true
  }'

# Admin režim
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Jak přidat nového uživatele?",
    "isAdmin": "true",
    "includeCitations": true,
    "includeCosts": true,
    "includeMarkdown": true
  }'
```

## 🌐 API dokumentace

### `POST /api/ask`

Hlavní endpoint pro dotazování.

**Parametry:**

- `query` (string, povinné): Dotaz uživatele
- `isAdmin` (string, volitelné): `"true"` pro admin režim, `"false"` nebo chybí pro user režim
- `k` (number, výchozí: 6): Počet relevantních pasáží
- `includeCitations` (boolean, výchozí: false): Zahrnout citace
- `includeCosts` (boolean, výchozí: false): Zahrnout cost informace
- `includeMarkdown` (boolean, výchozí: false pro veřejné API): Vrátit markdown formátování

**Odpověď:**

```json
{
  "answer": "Odpověď na dotaz...",
  "citations": [
    {
      "id": 1,
      "file": "Zápasy",
      "idx": 0,
      "score": 0.85
    }
  ],
  "cost": {
    "usd": 0.0001,
    "tokens": {
      "prompt": 150,
      "completion": 50,
      "total": 200
    }
  }
}
```

### Veřejné API

Pro externí integrace použij autentizaci:

```bash
curl -X POST https://your-domain.com/api/ask \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_secret_key_here" \
  -d '{
    "query": "Jak resetovat heslo?",
    "websiteUrl": "https://example.com",
    "isAdmin": "false"
  }'
```

**Rate limiting**: 20 požadavků za 10 minut (nastavitelné přes `RATE_LIMIT_MAX_REQUESTS`)

## 🔧 Konfigurace

### Environment variables

```env
# Admin API klíč
ADMIN_KEY=super_secret_key

# JSON API token (volitelné, výchozí hodnota je v kódu)
HELP_API_TOKEN=$1$o7qkoaCQ$g1n1yA7PGHdZj6zvjiPOr.

# Složka pro cache dat
DOCS_DIR=./docs

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Vercel Blob Storage (pro produkci)
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Veřejné API
PUBLIC_API_KEY=your_secret_key_here
RATE_LIMIT_MAX_REQUESTS=20
```

## 🛠️ Nasazení na Vercel

1. Pushni kód do Git repozitáře
2. Připoj projekt k Vercelu
3. Nastav environment variables v Vercel Dashboard
4. Deploy

Indexy se ukládají do Vercel Blob Storage automaticky.

## 🧪 Odstraňování potíží

- **Žádná data**: Spusť nejdřív sync, pak reindex
- **První reindex je pomalý**: Stahuje se embedding model, pak už to běží rychle
- **Špatné odpovědi**: Zkontroluj, jestli je správně nastavený `isAdmin` parametr
- **Rate limit**: Zvyš `RATE_LIMIT_MAX_REQUESTS` nebo použij Vercel KV pro produkci

## 📝 Poznámky

- Data se načítají z `https://new-test-clen.esports.cz/api/help/list-local`
- Každý režim (user/admin) má vlastní knowledge base
- Citace zobrazují název modulu místo cesty k souboru
- Všechno je kompatibilní s Vercel nasazením
