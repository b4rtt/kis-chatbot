// Rate limiting pro veřejné API
// Ukládá časové razítka požadavků podle identifikátoru (IP nebo session ID)

type RateLimitEntry = {
  timestamps: number[];
};

// In-memory storage (pro produkci by bylo lepší použít Redis/Vercel KV)
// POZOR: Na Vercelu se resetuje při každém deploy/restartu serverless funkce
const rateLimitStore = new Map<string, RateLimitEntry>();

// Pro Vercel: použij Vercel KV pro perzistentní storage
// npm install @vercel/kv
// Pak odkomentuj kód níže a použij KV místo Map

// Čistící interval - odstraní staré záznamy každých 15 minut
setInterval(() => {
  const now = Date.now();
  const tenMinutesAgo = now - 10 * 60 * 1000;
  
  rateLimitStore.forEach((entry, key) => {
    entry.timestamps = entry.timestamps.filter((ts) => ts > tenMinutesAgo);
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  });
}, 15 * 60 * 1000);

export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number = 10 * 60 * 1000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = rateLimitStore.get(identifier);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(identifier, entry);
  }

  // Odstranit staré časové razítka
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Zkontrolovat limit PŘED přidáním nového požadavku
  const count = entry.timestamps.length;
  const allowed = count < maxRequests;
  
  // Přidat aktuální požadavek pouze pokud je povolen
  if (allowed) {
    entry.timestamps.push(now);
  }

  const remaining = Math.max(0, maxRequests - (count + (allowed ? 1 : 0)));
  const resetAt = entry.timestamps.length > 0 
    ? entry.timestamps[0] + windowMs 
    : now + windowMs;

  return { allowed, remaining, resetAt };
}

export function getIdentifier(req: Request | { headers: Headers }): string {
  const headers = req.headers;
  
  // 1. Zkus získat IP adresu z různých hlaviček (Vercel proxy)
  const forwarded = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const cfConnectingIp = headers.get("cf-connecting-ip");
  const vercelIp = headers.get("x-vercel-forwarded-for");
  
  const ip = forwarded?.split(",")[0]?.trim() || 
             realIp || 
             cfConnectingIp ||
             vercelIp ||
             "unknown";
  
  // 2. Přidej User-Agent pro lepší identifikaci (kombinace IP + UA)
  // Tím se sníží problém se sdílenými IP (NAT, proxy, VPN)
  const userAgent = headers.get("user-agent") || "unknown";
  const userAgentHash = userAgent.length > 0 
    ? userAgent.substring(0, 20).replace(/[^a-zA-Z0-9]/g, "") 
    : "unknown";
  
  // 3. Kombinace IP + User-Agent hash pro lepší identifikaci
  // Na Vercelu může být IP stejná pro více uživatelů za proxy
  return `${ip}:${userAgentHash}`;
}

