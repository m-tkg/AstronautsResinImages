import { SHEET, circleAt, imagePlacement, withPrintResolution } from './layout.js';
import { serializeProject, restoreProject } from './project.js';

const $ = (id) => document.getElementById(id);
const slots = Array.from({ length: 35 }, () => null);
const buttons = [];
let current = -1;
let draft = null;
let uploadIndex = -1;
let loadSequence = 0;
let drag = null;
let statusTimer;
let exporting = false;
let projectBusy = false;
const editor = $('editor');
const crop = $('crop');

function notify(message) {
  $('status').textContent = message;
  $('status').hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('status').hidden = true; }, 5000);
}

function paint(canvas, record) {
  const ctx = canvas.getContext('2d');
  const d = canvas.width;
  ctx.clearRect(0, 0, d, d);
  ctx.save();
  ctx.beginPath(); ctx.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, d, d);
  const p = imagePlacement(record.image.naturalWidth, record.image.naturalHeight, d, record.zoom, record.x * d, record.y * d);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(record.image, p.x, p.y, p.width, p.height);
  ctx.restore();
}

function constrain() {
  if (!draft) return;
  const p = imagePlacement(draft.image.naturalWidth, draft.image.naturalHeight, 1, draft.zoom, draft.x, draft.y);
  draft.x = p.x - (1 - p.width) / 2;
  draft.y = p.y - (1 - p.height) / 2;
}

function updateEditor() {
  constrain();
  paint(crop, draft);
  $('zoom').value = draft.zoom;
  $('zoom-value').textContent = `${Math.round(draft.zoom * 100)}%`;
  $('quality-note').textContent = Math.min(draft.image.naturalWidth, draft.image.naturalHeight) / draft.zoom < SHEET.diameter ? 'この倍率では元画像の解像度が不足しています。印刷時に粗くなる場合があります。' : '';
}

function chooseFile(index) {
  uploadIndex = index;
  $('file').value = '';
  $('file').click();
}

function openEditor(index, record) {
  current = index;
  draft = { ...record };
  $('slot-label').textContent = `CIRCLE ${String(index + 1).padStart(2, '0')} / 35`;
  $('remove').hidden = !slots[index];
  updateEditor();
  if (!editor.open) editor.showModal();
}

function renderSlot(index) {
  const button = buttons[index];
  button.replaceChildren();
  button.classList.toggle('filled', !!slots[index]);
  button.setAttribute('aria-label', `${Math.floor(index / 5) + 1} 行 ${index % 5 + 1} 列：${slots[index] ? '画像を編集' : '画像を追加'}`);
  if (slots[index]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SHEET.diameter;
    paint(canvas, slots[index]);
    button.append(canvas);
  } else {
    const plus = document.createElement('span'); plus.className = 'plus'; plus.textContent = '+'; plus.setAttribute('aria-hidden', 'true');
    const number = document.createElement('span'); number.className = 'slot-number'; number.textContent = String(index + 1).padStart(2, '0'); number.setAttribute('aria-hidden', 'true');
    button.append(plus, number);
  }
  const count = slots.filter(Boolean).length;
  $('count').textContent = count;
  $('save').disabled = $('print').disabled = count === 0 || exporting;
  $('save-project').disabled = projectBusy;
}

for (let i = 0; i < 35; i++) {
  const position = circleAt(i);
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'slot';
  button.style.left = `${position.x / SHEET.width * 100}%`;
  button.style.top = `${position.y / SHEET.height * 100}%`;
  button.style.width = `${SHEET.diameter / SHEET.width * 100}%`;
  button.style.height = `${SHEET.diameter / SHEET.height * 100}%`;
  button.addEventListener('click', () => slots[i] ? openEditor(i, slots[i]) : chooseFile(i));
  buttons.push(button); $('sheet').append(button); renderSlot(i);
}

$('file').addEventListener('change', async () => {
  const file = $('file').files[0];
  if (!file) return;
  const target = uploadIndex;
  const sequence = ++loadSequence;
  try {
    let dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (sequence !== loadSequence) return;
    if (!/^data:image\//i.test(dataUrl)) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      dataUrl = canvas.toDataURL('image/png');
    }
    openEditor(target, { image, name: file.name, width: image.naturalWidth, height: image.naturalHeight, dataUrl, zoom: 1, x: 0, y: 0 });
  } catch {
    notify('画像を読み込めませんでした。JPEG・PNG・WebP などの画像を選んでください。');
  }
});

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

$('save-project').addEventListener('click', () => {
  try {
    download(new Blob([serializeProject(slots)], { type: 'application/json' }), 'astronauts.astronauts.json');
    notify('画像と編集内容をプロジェクトに保存しました。「プロジェクトを開く」から再編集できます。');
  } catch (error) { console.error(error); notify('プロジェクトを保存できませんでした。'); }
});
$('open-project').addEventListener('click', () => { $('project-file').value = ''; $('project-file').click(); });
$('project-file').addEventListener('change', async () => {
  const file = $('project-file').files[0];
  if (!file || projectBusy) return;
  projectBusy = true;
  document.querySelector('.workspace').inert = true;
  notify('プロジェクトを読み込んでいます…');
  try {
    const restored = await restoreProject(await file.text(), async (record) => {
      const image = new Image(); image.src = record.dataUrl; await image.decode(); return image;
    });
    if (slots.some(Boolean) && !window.confirm('現在の配置を、選択したプロジェクトの内容に置き換えます。未保存の変更は失われます。開きますか？')) {
      notify('読み込みをキャンセルしました。'); return;
    }
    ++loadSequence;
    slots.splice(0, slots.length, ...restored);
    slots.forEach((_, index) => renderSlot(index));
    notify('プロジェクトを開きました。画像をクリックすると続きから編集できます。');
  } catch (error) {
    console.error(error);
    notify('プロジェクトを読み込めませんでした。対応するファイルか確認してください。現在の配置は変更していません。');
  } finally {
    projectBusy = false;
    document.querySelector('.workspace').inert = false;
    $('save-project').disabled = false;
  }
});

$('replace').addEventListener('click', () => chooseFile(current));
$('reset').addEventListener('click', () => { draft.zoom = 1; draft.x = draft.y = 0; updateEditor(); });
$('zoom').addEventListener('input', (event) => { draft.zoom = Number(event.target.value); updateEditor(); });
$('apply').addEventListener('click', () => { slots[current] = { ...draft }; renderSlot(current); editor.close('apply'); buttons[current].focus(); });
$('remove').addEventListener('click', () => { slots[current] = null; renderSlot(current); editor.close('remove'); buttons[current].focus(); });
editor.addEventListener('close', () => { ++loadSequence; draft = null; drag = null; if (current >= 0) buttons[current].focus(); });

crop.addEventListener('pointerdown', (event) => {
  if (!draft) return;
  event.preventDefault(); crop.focus(); crop.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
crop.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId || !draft) return;
  const d = crop.getBoundingClientRect().width;
  draft.x += (event.clientX - drag.x) / d;
  draft.y += (event.clientY - drag.y) / d;
  drag.x = event.clientX; drag.y = event.clientY;
  updateEditor();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) crop.addEventListener(type, () => { drag = null; });
crop.addEventListener('keydown', (event) => {
  if (!draft) return;
  const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!move) return;
  event.preventDefault();
  const step = event.shiftKey ? 0.05 : 0.01;
  draft.x += move[0] * step; draft.y += move[1] * step; updateEditor();
});

function sheetCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = SHEET.width; canvas.height = SHEET.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const circle = document.createElement('canvas'); circle.width = circle.height = SHEET.diameter;
  slots.forEach((record, index) => {
    if (!record) return;
    paint(circle, record);
    const p = circleAt(index); ctx.drawImage(circle, p.x, p.y);
  });
  return canvas;
}

async function exportSheet(print) {
  if (exporting || !slots.some(Boolean)) return;
  exporting = true; $('save').disabled = $('print').disabled = true;
  try {
    const canvas = sheetCanvas();
    if (print) {
      $('print-sheet').src = canvas.toDataURL('image/png');
      await $('print-sheet').decode();
      window.print();
    } else {
      const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('PNG を作成できませんでした')), 'image/png'));
      const bytes = withPrintResolution(new Uint8Array(await blob.arrayBuffer()), SHEET.dpi);
      download(new Blob([bytes], { type: 'image/png' }), 'astronauts-A4-300dpi.png');
      notify('印刷用 PNG を書き出しました。印刷倍率は「100% / 実際のサイズ」に設定してください。');
    }
  } catch (error) { console.error(error); notify('書き出しに失敗しました。もう一度お試しください。'); }
  finally { exporting = false; $('save').disabled = $('print').disabled = !slots.some(Boolean); }
}
$('save').addEventListener('click', () => exportSheet(false));
$('print').addEventListener('click', () => exportSheet(true));
window.addEventListener('beforeprint', () => { if (slots.some(Boolean)) $('print-sheet').src = sheetCanvas().toDataURL('image/png'); });
window.addEventListener('beforeunload', (event) => { if (slots.some(Boolean)) { event.preventDefault(); event.returnValue = ''; } });
