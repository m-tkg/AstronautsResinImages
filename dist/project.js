import { SHEET } from './layout.js';

const FORMAT = 'astronauts-circle-project';
const IMAGE_DATA = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i;

function validate(document) {
  if (!document || document.format !== FORMAT || ![1, 2].includes(document.version)) throw new Error('対応していないプロジェクト形式です。');
  if (!document.sheet || Object.entries(SHEET).some(([key, value]) => document.sheet[key] !== value)) throw new Error('用紙設定が一致しません。');
  if (!Array.isArray(document.slots) || document.slots.length !== 35) throw new Error('配置データが不正です。');
  return document.slots.map((slot) => {
    if (slot === null) return null;
    if (!slot || typeof slot.name !== 'string' || !slot.name
      || (document.version === 1 ? typeof slot.dataUrl !== 'string' || !IMAGE_DATA.test(slot.dataUrl) : typeof slot.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(slot.sha256))
      || !Number.isInteger(slot.width) || slot.width <= 0 || !Number.isInteger(slot.height) || slot.height <= 0
      || !Number.isFinite(slot.zoom) || slot.zoom < 1 || slot.zoom > 4 || !Number.isFinite(slot.x) || !Number.isFinite(slot.y)) {
      throw new Error('画像または調整データが不正です。');
    }
    const { name, width, height, dataUrl, sha256, zoom, x, y } = slot;
    return { name, width, height, ...(document.version === 1 ? { dataUrl } : { sha256 }), zoom, x, y };
  });
}

export function serializeProject(slots, { embedImages = false } = {}) {
  const document = { format: FORMAT, version: embedImages ? 1 : 2, sheet: SHEET, slots };
  // Pick only portable fields; HTMLImageElement and other runtime state never enter the file.
  document.slots = validate(document);
  return JSON.stringify(document);
}

export async function matchProjectFiles(records, files, fingerprint) {
  const required = new Set(records.filter(r => r && !r.dataUrl).map(r => r.sha256));
  const matched = new Map();
  for (const file of files) {
    const hash = await fingerprint(file);
    if (required.has(hash)) matched.set(hash, file);
    if (matched.size === required.size) break;
  }
  const missing = [...new Set(records.filter(r => r && !r.dataUrl && !matched.has(r.sha256)).map(r => r.name))];
  if (missing.length) {
    const error = new Error(`画像ファイルが不足しています: ${missing.join('、')}`);
    error.missingImages = missing;
    throw error;
  }
  return matched;
}

export function parseProject(text) {
  return validate(JSON.parse(text));
}

export async function restoreProject(text, decodeImage) {
  const records = parseProject(text);
  const result = [];
  // Decode sequentially to avoid 35 simultaneous full-resolution image decoders.
  for (const record of records) {
    if (!record) { result.push(null); continue; }
    const image = await decodeImage(record);
    if (image.naturalWidth !== record.width || image.naturalHeight !== record.height) throw new Error('画像の寸法が保存データと一致しません。');
    result.push({ ...record, image });
  }
  return result;
}
