import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject, parseProject, restoreProject } from '../dist/project.js';
import { SHEET } from '../dist/layout.js';

const image = { name: '月.png', width: 600, height: 300, dataUrl: 'data:image/png;base64,aGVsbG8=', zoom: 2.37, x: -0.25, y: 0.1 };
const slots = () => Array.from({ length: 35 }, (_, i) => i === 6 || i === 34 ? { ...image } : null);

test('画像本体・名前・寸法・倍率・位置・空き枠を往復保存する', () => {
  const saved = serializeProject(slots());
  const doc = JSON.parse(saved);
  assert.equal(doc.format, 'astronauts-circle-project');
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.sheet, SHEET);
  assert.deepEqual(parseProject(saved), slots());
  assert.deepEqual(parseProject(serializeProject(Array(35).fill(null))), Array(35).fill(null));
});

test('別形式・将来バージョン・異なる用紙設定・壊れたデータを拒否する', () => {
  const document = JSON.parse(serializeProject(slots()));
  const invalid = [
    { ...document, format: 'other' }, { ...document, version: 2 },
    { ...document, sheet: { ...SHEET, diameter: 284 } },
    { ...document, slots: [] },
    ...[{ zoom: 0 }, { zoom: 4.1 }, { x: null }, { y: '0' }, { width: -1 }, { height: 0 }, { dataUrl: 'https://example.com/image.png' }, { name: null }].map((change) => ({ ...document, slots: slots().map((slot) => slot ? { ...slot, ...change } : null) })),
  ];
  for (const input of invalid) assert.throws(() => parseProject(JSON.stringify(input)));
  assert.throws(() => parseProject('{'));
});

test('復元は全画像の読み込み成功後に返し、途中失敗では既存データを変更しない', async () => {
  const existing = slots();
  const restored = await restoreProject(serializeProject(existing), async (record) => ({ naturalWidth: record.width, naturalHeight: record.height }));
  assert.equal(restored[6].image.naturalWidth, 600);
  assert.equal(restored[34].zoom, 2.37);
  let count = 0;
  await assert.rejects(restoreProject(serializeProject(existing), async () => { if (++count === 2) throw new Error('decode failed'); return {}; }));
  assert.deepEqual(existing, slots());
});
