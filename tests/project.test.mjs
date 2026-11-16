import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject, parseProject, restoreProject, matchProjectFiles } from '../dist/project.js';
import { SHEET } from '../dist/layout.js';

const image = { name: '月.png', width: 600, height: 300, dataUrl: 'data:image/png;base64,aGVsbG8=', zoom: 2.37, x: -0.25, y: 0.1 };
const slots = () => Array.from({ length: 35 }, (_, i) => i === 6 || i === 34 ? { ...image } : null);

test('画像本体・名前・寸法・倍率・位置・空き枠を往復保存する', () => {
  const saved = serializeProject(slots(), { embedImages: true });
  const doc = JSON.parse(saved);
  assert.equal(doc.format, 'astronauts-circle-project');
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.sheet, SHEET);
  assert.deepEqual(parseProject(saved), slots());
  assert.deepEqual(parseProject(serializeProject(Array(35).fill(null))), Array(35).fill(null));
});

test('別形式・将来バージョン・異なる用紙設定・壊れたデータを拒否する', () => {
  const document = JSON.parse(serializeProject(slots(), { embedImages: true }));
  const invalid = [
    { ...document, format: 'other' }, { ...document, version: 99 },
    { ...document, sheet: { ...SHEET, diameter: 284 } },
    { ...document, slots: [] },
    ...[{ zoom: 0 }, { zoom: 4.1 }, { x: null }, { y: '0' }, { width: -1 }, { height: 0 }, { dataUrl: 'https://example.com/image.png' }, { name: null }].map((change) => ({ ...document, slots: slots().map((slot) => slot ? { ...slot, ...change } : null) })),
  ];
  for (const input of invalid) assert.throws(() => parseProject(JSON.stringify(input)));
  assert.throws(() => parseProject('{'));
});

test('復元は全画像の読み込み成功後に返し、途中失敗では既存データを変更しない', async () => {
  const existing = slots();
  const restored = await restoreProject(serializeProject(existing, { embedImages: true }), async (record) => ({ naturalWidth: record.width, naturalHeight: record.height }));
  assert.equal(restored[6].image.naturalWidth, 600);
  assert.equal(restored[34].zoom, 2.37);
  let count = 0;
  await assert.rejects(restoreProject(serializeProject(existing, { embedImages: true }), async (record) => { if (++count === 2) throw new Error('decode failed'); return { naturalWidth: record.width, naturalHeight: record.height }; }));
  assert.equal(count, 2);
  await assert.rejects(restoreProject(serializeProject(existing, { embedImages: true }), async () => ({ naturalWidth: 1, naturalHeight: 1 })));
  assert.deepEqual(existing, slots());
});

test('標準保存は画像を埋め込まず、内容ハッシュと調整値を保持する', () => {
  const refs = slots().map(s => s ? { ...s, sha256: 'a'.repeat(64) } : null);
  const saved = serializeProject(refs);
  assert.equal(JSON.parse(saved).version, 2);
  assert.ok(!saved.includes('data:image'));
  assert.equal(parseProject(saved)[6].sha256, 'a'.repeat(64));
  assert.equal(parseProject(saved)[34].zoom, 2.37);
  assert.throws(() => serializeProject(slots()));
  assert.throws(() => parseProject(saved.replace('a'.repeat(64), 'invalid')));
});

test('画像ファイルの内容で照合し、同名の別画像を誤採用しない', async () => {
  const records = slots().map(s => s ? { ...s, sha256: 'a'.repeat(64), dataUrl: undefined } : null);
  const correct = { name: 'renamed.png', hash: 'a'.repeat(64) };
  const wrong = { name: '月.png', hash: 'b'.repeat(64) };
  const matched = await matchProjectFiles(records, [wrong, correct], async f => f.hash);
  assert.equal(matched.get('a'.repeat(64)), correct);
  await assert.rejects(matchProjectFiles(records, [wrong], async f => f.hash), /月.png/);
});
