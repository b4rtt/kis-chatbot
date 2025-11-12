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
const arr = Array.isArray(out.data) ? out.data : Array.from(out.data);
return Array.isArray(arr[0]) ? arr as number[][] : [arr as number[]];
}
