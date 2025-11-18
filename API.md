# Veřejné API dokumentace

Tento dokument popisuje použití veřejného API pro integraci chatbotu do externích aplikací.

## Endpoint

```
POST /api/ask
```

## Autentizace

API vyžaduje autentizaci pomocí secret key. Klíč se předává v HTTP hlavičce:

- **Hlavička**: `x-api-key` nebo `Authorization: Bearer <key>`
- **Příklad**: `x-api-key: your_secret_key_here`

## Rate Limiting

API je chráněno proti zneužití pomocí rate limitingu:

- **Limit**: 20 požadavků za 10 minut (nastavitelné)
- **Okno**: 10 minut (fixní)
- **Identifikace**: Podle IP adresy klienta

API vrací informace o rate limitu v hlavičkách:

- `X-RateLimit-Limit`: Maximální počet požadavků
- `X-RateLimit-Remaining`: Zbývající počet požadavků
- `X-RateLimit-Reset`: Unix timestamp, kdy se limit resetuje
- `Retry-After`: Počet sekund do resetu (při překročení limitu)

## Request

### Headers

```
Content-Type: application/json
x-api-key: your_secret_key_here
```

### Body

```json
{
  "query": "Jak resetovat heslo?",
  "websiteUrl": "https://example.com"
}
```

### Parametry

| Parametr           | Typ     | Povinný  | Výchozí | Popis                                                                                                |
| ------------------ | ------- | -------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `query`            | string  | ✅ Ano   | -       | Dotaz uživatele                                                                                      |
| `websiteUrl`       | string  | ✅ Ano\* | -       | URL webu, na kterém API běží (\*povinný pouze při použití veřejného API režimu s `x-api-key` header) |
| `k`                | number  | ❌ Ne    | 6       | Počet relevantních pasáží k vrácení                                                                  |
| `includeCitations` | boolean | ❌ Ne    | false   | Zahrnout citations do odpovědi                                                                       |
| `includeCosts`     | boolean | ❌ Ne    | false   | Zahrnout cost informace do odpovědi                                                                  |
| `includeMarkdown`  | boolean | ❌ Ne    | true    | Vrátit odpověď s markdown formátováním (false = plain text)                                          |

## Response

### Úspěšná odpověď (200 OK)

**S citations** (`includeCitations: true`):

```json
{
  "answer": "Pro resetování hesla navštivte stránku...",
  "citations": [
    {
      "id": 1,
      "file": "docs/faq.md",
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

**Bez citations** (`includeCitations: false` nebo parametr není poslán, výchozí):

```json
{
  "answer": "Pro resetování hesla navštivte stránku..."
}
```

**S costs** (`includeCosts: true`):

```json
{
  "answer": "Pro resetování hesla navštivte stránku...",
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

**Bez markdown** (`includeMarkdown: false`):

```json
{
  "answer": "Pro resetování hesla navštivte stránku s resetem hesla. Najdete tam formulář pro zadání emailu."
}
```

**S markdown** (`includeMarkdown: true` nebo parametr není poslán, výchozí):

```json
{
  "answer": "Pro resetování hesla navštivte **stránku s resetem hesla**. Najdete tam formulář pro zadání emailu."
}
```

### Chybové odpovědi

#### 401 Unauthorized

Neplatný nebo chybějící API klíč:

```json
{
  "error": "Unauthorized",
  "message": "Neplatný nebo chybějící API klíč"
}
```

#### 400 Bad Request

Chybějící nebo neplatné parametry:

```json
{
  "error": "Bad Request",
  "message": "Chybí povinný parametr websiteUrl"
}
```

#### 429 Too Many Requests

Překročen rate limit:

```json
{
  "error": "Too Many Requests",
  "message": "Překročen limit požadavků. Maximálně 20 zpráv za 10 minut.",
  "resetAt": "2024-01-01T12:00:00.000Z"
}
```

#### 500 Internal Server Error

Chyba serveru:

```json
{
  "error": "Internal Server Error",
  "message": "Popis chyby"
}
```

## Příklady použití

### cURL

```bash
curl -X POST https://esports-chatbot.vercel.app/api/ask \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_secret_key_here" \
  -d '{
    "query": "Kdo je Adam Joska?",
    "websiteUrl": "https://example.com"
  }'
```

### JavaScript/TypeScript

```typescript
async function askChatbot(query: string, websiteUrl: string) {
  const response = await fetch(
    "https://esports-chatbot.vercel.app/api/public/ask",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "your_secret_key_here",
      },
      body: JSON.stringify({
        query,
        websiteUrl,
        k: 6,
      }),
    }
  );

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(
        `Rate limit exceeded. Retry after ${retryAfter} seconds.`
      );
    }
    const error = await response.json();
    throw new Error(error.message || "API request failed");
  }

  const data = await response.json();
  return data;
}

// Použití
try {
  const result = await askChatbot(
    "Jak resetovat heslo?",
    "https://example.com"
  );
  console.log(result.answer);
  console.log("Citace:", result.citations);
} catch (error) {
  console.error("Chyba:", error);
}
```

### React Hook

```typescript
import { useState, useCallback } from "react";

function useChatbotAPI(apiKey: string, websiteUrl: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(
    async (query: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          "https://esports-chatbot.vercel.app/api/ask",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify({
              query,
              websiteUrl,
              k: 6,
              localOnly: false,
            }),
          }
        );

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            throw new Error(
              `Rate limit exceeded. Retry after ${retryAfter} seconds.`
            );
          }
          const errorData = await response.json();
          throw new Error(errorData.message || "API request failed");
        }

        const data = await response.json();
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiKey, websiteUrl]
  );

  return { ask, loading, error };
}

// Použití v komponentě
function ChatComponent() {
  const { ask, loading, error } = useChatbotAPI(
    "your_secret_key",
    "https://example.com"
  );
  const [answer, setAnswer] = useState<string | null>(null);

  const handleAsk = async () => {
    try {
      const result = await ask("Jak resetovat heslo?");
      setAnswer(result.answer);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <button onClick={handleAsk} disabled={loading}>
        {loading ? "Načítám..." : "Zeptat se"}
      </button>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {answer && <div>{answer}</div>}
    </div>
  );
}
```

### Python

```python
import requests
import time

def ask_chatbot(query: str, website_url: str, api_key: str):
    url = "https://esports-chatbot.vercel.app/api/ask"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }
    data = {
        "query": query,
        "websiteUrl": website_url,
        "k": 6,
    }

    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After")
        raise Exception(f"Rate limit exceeded. Retry after {retry_after} seconds.")

    response.raise_for_status()
    return response.json()

# Použití
try:
    result = ask_chatbot("Jak resetovat heslo?", "https://example.com", "your_secret_key")
    print(result["answer"])
    print("Citace:", result["citations"])
except Exception as e:
    print(f"Chyba: {e}")
```

## Rate Limiting - Best Practices

1. **Sleduj hlavičky**: Vždy kontroluj `X-RateLimit-Remaining` a `X-RateLimit-Reset`
2. **Exponenciální backoff**: Při 429 odpovědi použij exponenciální backoff před dalším pokusem
3. **Cachování**: Pokud je to možné, cachuj odpovědi na stejné dotazy
4. **Batch requests**: Pokud potřebuješ více dotazů, zkus je spojit do jednoho (pokud API podporuje)

## Podpora

Pro dotazy a podporu kontaktujte tým technické podpory.
