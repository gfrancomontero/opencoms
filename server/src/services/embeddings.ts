import path from 'path';
import fs from 'fs';
import { MODELS_DIR, EMBEDDING_MODEL_NAME, EMBEDDING_DIMS } from '../config.js';
import { log } from '../logger.js';

let ort: typeof import('onnxruntime-node') | null = null;
let session: any = null;
let tokenizer: any = null;

const MODEL_DIR = path.join(MODELS_DIR, EMBEDDING_MODEL_NAME);
const MODEL_FILE = path.join(MODEL_DIR, 'model.onnx');
const TOKENIZER_FILE = path.join(MODEL_DIR, 'tokenizer.json');
const CONFIG_FILE = path.join(MODEL_DIR, 'config.json');

// Simple WordPiece tokenizer for all-MiniLM-L6-v2
interface TokenizerData {
  vocab: Record<string, number>;
  idToToken: Map<number, string>;
}

let tokenizerData: TokenizerData | null = null;

function loadTokenizer(): TokenizerData {
  if (tokenizerData) return tokenizerData;

  const raw = JSON.parse(fs.readFileSync(TOKENIZER_FILE, 'utf-8'));
  const vocab: Record<string, number> = {};

  // HuggingFace tokenizer.json format
  if (raw.model?.vocab) {
    Object.assign(vocab, raw.model.vocab);
  }

  const idToToken = new Map<number, string>();
  for (const [token, id] of Object.entries(vocab)) {
    idToToken.set(id as number, token);
  }

  tokenizerData = { vocab, idToToken };
  return tokenizerData;
}

function wordPieceTokenize(text: string, maxLen: number = 128): { inputIds: number[]; attentionMask: number[] } {
  const { vocab } = loadTokenizer();
  const CLS = vocab['[CLS]'] ?? 101;
  const SEP = vocab['[SEP]'] ?? 102;
  const UNK = vocab['[UNK]'] ?? 100;
  const PAD = vocab['[PAD]'] ?? 0;

  // Basic pre-tokenization
  const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);

  const tokens: number[] = [CLS];

  for (const word of words) {
    if (tokens.length >= maxLen - 1) break;

    let remaining = word;
    let isFirst = true;

    while (remaining.length > 0 && tokens.length < maxLen - 1) {
      let matched = false;

      for (let end = remaining.length; end > 0; end--) {
        const sub = isFirst ? remaining.slice(0, end) : `##${remaining.slice(0, end)}`;
        if (vocab[sub] !== undefined) {
          tokens.push(vocab[sub]);
          remaining = remaining.slice(end);
          isFirst = false;
          matched = true;
          break;
        }
      }

      if (!matched) {
        tokens.push(UNK);
        break;
      }
    }
  }

  tokens.push(SEP);

  const inputIds = tokens.slice(0, maxLen);
  const attentionMask = new Array(inputIds.length).fill(1);

  // Pad
  while (inputIds.length < maxLen) {
    inputIds.push(PAD);
    attentionMask.push(0);
  }

  return { inputIds, attentionMask };
}

export function isModelDownloaded(): boolean {
  return fs.existsSync(MODEL_FILE) && fs.existsSync(TOKENIZER_FILE);
}

export async function downloadEmbeddingModel(): Promise<void> {
  if (isModelDownloaded()) {
    log.verbose('Embedding model already downloaded');
    return;
  }

  log.info('Downloading embedding model (all-MiniLM-L6-v2)...');
  fs.mkdirSync(MODEL_DIR, { recursive: true });

  const baseUrl = 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main';

  const files = [
    { url: `${baseUrl}/onnx/model.onnx`, dest: MODEL_FILE },
    { url: `${baseUrl}/tokenizer.json`, dest: TOKENIZER_FILE },
    { url: `${baseUrl}/config.json`, dest: CONFIG_FILE },
  ];

  for (const { url, dest } of files) {
    const name = path.basename(dest);
    log.info(`  Downloading ${name}...`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to download ${name}: ${resp.statusText}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(dest, buffer);
    log.verbose(`  Downloaded ${name} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  log.info('Embedding model downloaded');
}

async function getSession(): Promise<any> {
  if (session) return session;

  if (!ort) {
    ort = await import('onnxruntime-node');
  }

  log.verbose('Loading ONNX embedding model...');
  session = await ort.InferenceSession.create(MODEL_FILE, {
    executionProviders: ['cpu'],
  });
  log.verbose('ONNX session ready');
  return session;
}

function meanPooling(lastHiddenState: Float32Array, attentionMask: number[], seqLen: number, hiddenSize: number): Float32Array {
  const output = new Float32Array(hiddenSize);
  let maskSum = 0;

  for (let i = 0; i < seqLen; i++) {
    if (attentionMask[i] === 1) {
      maskSum += 1;
      for (let j = 0; j < hiddenSize; j++) {
        output[j] += lastHiddenState[i * hiddenSize + j];
      }
    }
  }

  if (maskSum > 0) {
    for (let j = 0; j < hiddenSize; j++) {
      output[j] /= maskSum;
    }
  }

  // L2 normalize
  let norm = 0;
  for (let j = 0; j < hiddenSize; j++) {
    norm += output[j] * output[j];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let j = 0; j < hiddenSize; j++) {
      output[j] /= norm;
    }
  }

  return output;
}

export async function embed(text: string): Promise<Float32Array> {
  const sess = await getSession();

  if (!ort) {
    ort = await import('onnxruntime-node');
  }

  const maxLen = 128;
  const { inputIds, attentionMask } = wordPieceTokenize(text, maxLen);

  const inputIdsTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, maxLen]);
  const attentionMaskTensor = new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, maxLen]);
  const tokenTypeIds = new ort.Tensor('int64', new BigInt64Array(maxLen), [1, maxLen]);

  const feeds: Record<string, any> = {
    input_ids: inputIdsTensor,
    attention_mask: attentionMaskTensor,
    token_type_ids: tokenTypeIds,
  };

  const results = await sess.run(feeds);
  const outputName = sess.outputNames[0];
  const lastHiddenState = results[outputName].data as Float32Array;
  const hiddenSize = EMBEDDING_DIMS;

  return meanPooling(lastHiddenState, attentionMask, maxLen, hiddenSize);
}

export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

export function bufferToEmbedding(buf: Buffer): Float32Array {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; i++) {
    view[i] = buf[i];
  }
  return new Float32Array(ab);
}
