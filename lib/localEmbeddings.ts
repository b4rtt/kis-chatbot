import { pipeline } from "@xenova/transformers";

const MODEL_ID = process.env.EMB_MODEL_ID || "Xenova/multilingual-e5-small"; // good multilingual small model

let extractor: any;
async function getExtractor() {
if (!extractor) extractor = await pipeline("feature-extraction", MODEL_ID);
return extractor;
}

// mean pooling + normalize => cosine = dot product
export async function embedTexts(texts: string[]): Promise<number[][]> {
const model = await getExtractor();
const out = await model(texts, { pooling: "mean", normalize: true });
const arr = Array.isArray(out.data) ? out.data : Array.from(out.data);
return Array.isArray(arr[0]) ? arr as number[][] : [arr as number[]];
}
