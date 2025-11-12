export function splitMarkdownToChunks(md: string, maxTokens = 800, overlap = 120) {
const sections = md.split(/\n(?=#{1,6}\s)/g);
const chunks: string[] = [];
for (const sec of sections) {
const words = sec.split(/\s+/);
for (let i = 0; i < words.length; i += Math.max(1, maxTokens - overlap)) {
const part = words.slice(i, i + maxTokens).join(" ").trim();
if (part) chunks.push(part);
}
}
return chunks;
}
