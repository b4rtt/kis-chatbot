import { pipeline, env } from "@xenova/transformers";

const MODEL_ID = process.env.EMB_MODEL_ID || "Xenova/multilingual-e5-small"; // good multilingual small model

// Set cache directory for Vercel (read-only filesystem except /tmp)
if (process.env.VERCEL_ENV) {
  env.cacheDir = "/tmp/transformers_cache";
} else if (process.env.TRANSFORMERS_CACHE) {
  env.cacheDir = process.env.TRANSFORMERS_CACHE;
}

let extractor: any;
async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", MODEL_ID);
  }
  return extractor;
}

// mean pooling + normalize => cosine = dot product
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = await getExtractor();
  const out = await model(texts, { pooling: "mean", normalize: true });
  
  // Model returns flat array with dims [batch_size, vector_size]
  const data = Array.isArray(out.data) ? out.data : Array.from(out.data);
  
  // Check if we have dimensions info
  if (out.dims && out.dims.length === 2) {
    const [batchSize, vectorSize] = out.dims;
    const vectors: number[][] = [];
    
    // Reshape flat array into 2D array
    for (let i = 0; i < batchSize; i++) {
      vectors.push(data.slice(i * vectorSize, (i + 1) * vectorSize));
    }
    
    return vectors;
  }
  
  // Fallback for single vector or already 2D array
  return Array.isArray(data[0]) ? data as number[][] : [data as number[]];
}
