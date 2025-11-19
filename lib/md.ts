export function splitMarkdownToChunks(md: string) {
  // Detekujeme, jestli má dokument markdown headingy
  const hasHeadings = /\n#{1,6}\s/.test(md);
  
  // Pro dokumenty s headingy použijeme větší chunky (headingy poskytují kontext)
  // Pro prosté textové dokumenty menší chunky pro větší granularitu
  const maxTokens = hasHeadings ? 800 : 300;
  const overlap = hasHeadings ? 120 : 50;
  
  let sections: string[];
  
  if (hasHeadings) {
    // Rozdělíme podle headingů
    sections = md.split(/\n(?=#{1,6}\s)/g);
  } else {
    // Pro prosté textové dokumenty rozdělíme podle odstavců
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

/**
 * Rozdělí prostý text na chunky pro embeddings
 * Podobné jako splitMarkdownToChunks, ale pro strukturovaný text z JSONu
 */
export function splitTextToChunks(text: string) {
  // Detekujeme, jestli má text headingy (## nebo ###)
  const hasHeadings = /\n##+\s/.test(text);
  
  // Pro texty s headingy použijeme větší chunky
  const maxTokens = hasHeadings ? 800 : 300;
  const overlap = hasHeadings ? 120 : 50;
  
  let sections: string[];
  
  if (hasHeadings) {
    // Rozdělíme podle headingů (## nebo ###)
    sections = text.split(/\n(?=##+\s)/g);
  } else {
    // Pro prosté texty rozdělíme podle dvojitých odřádkování
    sections = text.split(/\n\s*\n/g);
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
