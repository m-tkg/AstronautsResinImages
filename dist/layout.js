export const SHEET = Object.freeze({ width: 2480, height: 3508, dpi: 300, diameter: 283, columns: 5, rows: 7 });

export function circleAt(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 35) throw new RangeError('円の番号が範囲外');
  return { x: 344.5 + (index % 5) * 377, y: 262.5 + Math.floor(index / 5) * 450 };
}

// Offsets use the same coordinate system as diameter, relative to the image center.
export function imagePlacement(sourceWidth, sourceHeight, diameter, zoom, offsetX, offsetY) {
  const scale = Math.max(diameter / sourceWidth, diameter / sourceHeight) * zoom;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { width, height, x: Math.min(0, Math.max(diameter - width, (diameter - width) / 2 + offsetX)), y: Math.min(0, Math.max(diameter - height, (diameter - height) / 2 + offsetY)) };
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function withPrintResolution(png, dpi) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((b, i) => png[i] === b)) throw new Error('PNG 形式ではない');
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, Math.round(dpi / 0.0254));
  view.setUint32(12, Math.round(dpi / 0.0254));
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts = [png.slice(0, 8)];
  const source = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let inserted = false;
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error('PNG データが不完全');
    const length = source.getUint32(offset);
    const end = offset + length + 12;
    if (end > png.length) throw new Error('PNG データが不完全');
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(png.slice(offset, end));
    if (type === 'IHDR' && !inserted) { parts.push(chunk); inserted = true; }
    offset = end;
  }
  if (!inserted) throw new Error('PNG ヘッダーがない');
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let position = 0;
  for (const part of parts) { result.set(part, position); position += part.length; }
  return result;
}
