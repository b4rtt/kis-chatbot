// Rate limiting pro veřejné API
// Ukládá časové razítka požadavků podle identifikátoru (IP nebo session ID)

type RateLimitEntry = {
  timestamps: number[];
};

// In-memory storage (pro produkci by bylo lepší použít Redis nebo podobné)
const rateLimitStore = new Map<string, RateLimitEntry>();

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

  // Přidat aktuální požadavek
  entry.timestamps.push(now);

  const count = entry.timestamps.length;
  const allowed = count <= maxRequests;
  const remaining = Math.max(0, maxRequests - count);
  const resetAt = entry.timestamps.length > 0 
    ? entry.timestamps[0] + windowMs 
    : now + windowMs;

  return { allowed, remaining, resetAt };
}

export function getIdentifier(req: Request | { headers: Headers }): string {
  // Zkus získat IP adresu z různých hlaviček
  const headers = req.headers;
  const forwarded = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const cfConnectingIp = headers.get("cf-connecting-ip");
  
  const ip = forwarded?.split(",")[0]?.trim() || 
             realIp || 
             cfConnectingIp || 
             "unknown";
  
  return ip;
}

