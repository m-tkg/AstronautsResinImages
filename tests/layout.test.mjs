import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEET, circleAt, imagePlacement, withPrintResolution, crc32 } from '../dist/layout.js';

test('PSD の実寸・解像度と 35 個の円を保持する', () => {
  assert.deepEqual(SHEET, { width: 2480, height: 3508, dpi: 300, diameter: 283, columns: 5, rows: 7 });
  const circles = Array.from({ length: 35 }, (_, i) => circleAt(i));
  for (const c of circles) {
    assert.ok(c.x >= 0 && c.y >= 0);
    assert.ok(c.x + 283 <= 2480 && c.y + 283 <= 3508);
  }
  assert.equal(circles[0].y, circles[4].y);
  assert.equal(circles[0].x, circles[30].x);
  assert.equal(circles[1].x - circles[0].x, circles[4].x - circles[3].x);
  assert.equal(circles[5].y - circles[0].y, circles[30].y - circles[25].y);
  assert.throws(() => circleAt(35), RangeError);
});

test('横長画像を円全体に充填、移動を端で制限する', () => {
  assert.deepEqual(imagePlacement(600, 300, 100, 1, 0, 0), { width: 200, height: 100, x: -50, y: 0 });
  assert.deepEqual(imagePlacement(600, 300, 100, 2, 999, -999), { width: 400, height: 200, x: 0, y: -100 });
  assert.deepEqual(imagePlacement(300, 600, 100, 1, 0, 0), { width: 100, height: 200, x: 0, y: -50 });
});

test('PNG に 300 dpi の pHYs と正しい CRC を埋め込む', () => {
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64'));
  const result = withPrintResolution(png, 300);
  const view = new DataView(result.buffer);
  assert.equal(new TextDecoder().decode(result.slice(37, 41)), 'pHYs');
  assert.equal(view.getUint32(41), 11811);
  assert.equal(view.getUint32(45), 11811);
  assert.equal(result[49], 1);
  assert.equal(view.getUint32(50), crc32(result.slice(37, 50)));
  assert.equal(withPrintResolution(result, 300).length, result.length);
  assert.throws(() => withPrintResolution(new Uint8Array(20), 300));
});
