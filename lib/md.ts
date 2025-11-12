export function splitMarkdownToChunks(md: string, maxTokens = 300, overlap = 50) {
  // Nejdříve zkusíme rozdělit podle headingů
  let sections = md.split(/\n(?=#{1,6}\s)/g);
  
  // Pokud nejsou žádné headingy, rozdělíme podle otázek nebo prázdných řádků
  if (sections.length === 1) {
    // Rozdělíme na odstavce (prázdné řádky)
    sections = md.split(/\n\s*\n/g);
  }
  
  const chunks: string[] = [];
  
  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;
    
    // Pokud je sekce krátká, přidáme ji jako jeden chunk
    const words = trimmed.split(/\s+/);
    if (words.length <= maxTokens) {
      chunks.push(trimmed);
      continue;
    }
    
    // Pro delší sekce je rozdělíme s překryvem
    for (let i = 0; i < words.length; i += Math.max(1, maxTokens - overlap)) {
      const part = words.slice(i, i + maxTokens).join(" ").trim();
      if (part) chunks.push(part);
    }
  }
  
  // Filtrujeme prázdné chunky
  return chunks.filter(c => c.length > 0);
}
