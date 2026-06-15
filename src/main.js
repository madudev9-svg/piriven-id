import JsBarcode from 'jsbarcode';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import embeddedPdf from './assets/id-card.bin?inline';
import './styles.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const CARD_WIDTH = 840;
const CARD_HEIGHT = 1320;
const MM_WIDTH = 53.34;
const MM_HEIGHT = 83.82;
const STORAGE_KEY = 'piriven-id-records-v1';
const SEQUENCE_KEY = 'piriven-id-sequence-v1';

const state = {
  photo: null,
  photoData: null,
  records: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map((record) => ({
    ...record,
    id: record.id || crypto.randomUUID(),
  })),
  editingId: null,
  selectedIds: new Set(),
};

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand-mark">ප</div>
    <div>
      <p class="eyebrow">PIRIVEN STUDENT SERVICES</p>
      <h1>Student ID Studio</h1>
    </div>
    <span class="status-pill"><i></i> Local & private</span>
  </header>

  <main class="workspace">
    <section class="panel form-panel">
      <div class="section-heading">
        <div><span>01</span><h2>Student details</h2></div>
        <button class="text-button" id="resetForm" type="button">Clear form</button>
      </div>

      <form id="studentForm">
        <div class="field-grid">
          <label class="field full">
            <span>නම</span>
            <input id="studentName" required maxlength="60" placeholder="ශිෂ්‍යයාගේ නම" />
          </label>
          <label class="field full">
            <span>විභාග අංකය</span>
            <input id="examNumber" required maxlength="30" placeholder="විභාග අංකය" />
          </label>
          <label class="field">
            <span>ඇතුළත් වූ දිනය</span>
            <input id="admissionDate" type="date" required />
          </label>
          <label class="field">
            <span>උපන් දිනය</span>
            <input id="dob" type="date" required />
          </label>
          <label class="field full">
            <span>ශිෂ්‍ය අංකය</span>
            <div class="number-row">
              <input id="studentNumber" required />
              <button id="refreshNumber" class="icon-button" type="button" title="Create next number">↻</button>
            </div>
            <small>ස්වයංක්‍රීයව ජනනය වේ. අවශ්‍ය නම් සුරැකීමට පෙර වෙනස් කළ හැක.</small>
          </label>
        </div>

        <label class="upload-zone" for="photoInput" id="uploadZone">
          <input id="photoInput" type="file" accept="image/png,image/jpeg,image/webp" />
          <span class="upload-icon">＋</span>
          <strong>Upload student photo</strong>
          <small>Portrait JPG or PNG. The image will be cropped to fit.</small>
        </label>

        <button class="primary-button" id="saveStudent" type="submit">Save student & generate card</button>
      </form>
    </section>

    <section class="preview-column">
      <div class="panel preview-panel">
        <div class="section-heading">
          <div><span>02</span><h2>Live preview</h2></div>
          <div class="side-toggle" role="group" aria-label="Preview side">
            <button class="active" data-side="front" type="button">Front</button>
            <button data-side="back" type="button">Back</button>
          </div>
        </div>

        <div class="card-stage">
          <canvas id="frontCanvas" width="840" height="1320"></canvas>
          <canvas id="backCanvas" width="840" height="1320" hidden></canvas>
        </div>

        <div class="export-grid">
          <button class="export-button" id="frontPng" type="button"><b>PNG</b><span>Download front</span></button>
          <button class="export-button" id="backPng" type="button"><b>PNG</b><span>Download back</span></button>
          <button class="export-button featured" id="twoSidePdf" type="button"><b>PDF</b><span>Two-sided document</span></button>
        </div>
      </div>
    </section>

    <section class="panel records-panel">
      <div class="section-heading">
        <div><span>03</span><h2>Recent students</h2></div>
        <p id="recordCount"></p>
      </div>
      <div class="records-toolbar">
        <label class="select-all"><input id="selectAll" type="checkbox" /> Select all</label>
        <button id="deleteSelected" class="tool-button danger" type="button" disabled>Delete selected</button>
        <button id="exportExcel" class="tool-button" type="button">Export Excel</button>
        <button id="exportJson" class="tool-button" type="button">Backup JSON</button>
        <label class="tool-button file-button">Import JSON<input id="importJson" type="file" accept="application/json,.json" /></label>
        <label class="tool-button file-button accent">Upload Excel<input id="importExcel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label>
      </div>
      <p class="import-help">Excel columns: name, examNumber, admissionDate, dob, studentNumber. Sinhala column names are also accepted.</p>
      <div id="recordsList" class="records-list"></div>
    </section>
  </main>
  <footer class="app-footer">
    <span>© ${new Date().getFullYear()} @Dev_Madu codes. All rights reserved.</span>
  </footer>
`;

const elements = {
  form: document.querySelector('#studentForm'),
  name: document.querySelector('#studentName'),
  examNumber: document.querySelector('#examNumber'),
  admissionDate: document.querySelector('#admissionDate'),
  dob: document.querySelector('#dob'),
  number: document.querySelector('#studentNumber'),
  photoInput: document.querySelector('#photoInput'),
  uploadZone: document.querySelector('#uploadZone'),
  front: document.querySelector('#frontCanvas'),
  back: document.querySelector('#backCanvas'),
  recordsList: document.querySelector('#recordsList'),
  recordCount: document.querySelector('#recordCount'),
  saveStudent: document.querySelector('#saveStudent'),
  selectAll: document.querySelector('#selectAll'),
  deleteSelected: document.querySelector('#deleteSelected'),
  importJson: document.querySelector('#importJson'),
  importExcel: document.querySelector('#importExcel'),
};

const [frontBackground, backBackground] = await renderPdfPages(embeddedPdf);
elements.number.value = getNextStudentNumber();

async function renderPdfPages(source) {
  const encodedPdf = source.slice(source.indexOf(',') + 1);
  const decodedPdf = atob(encodedPdf);
  const pdfData = Uint8Array.from(decodedPdf, (character) => character.charCodeAt(0));
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const renderedPages = [];
  for (let pageNumber = 1; pageNumber <= 2; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const initialViewport = page.getViewport({ scale: 1 });
    const scale = CARD_HEIGHT / initialViewport.height;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    renderedPages.push(canvas);
  }
  return renderedPages;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function getNextStudentNumber(forceIncrement = false) {
  let sequence = Number(localStorage.getItem(SEQUENCE_KEY) || 1);
  if (forceIncrement) {
    sequence += 1;
    localStorage.setItem(SEQUENCE_KEY, String(sequence));
  }
  const year = new Date().getFullYear();
  return `PIR/ABP/${year}/${String(sequence).padStart(4, '0')}`;
}

function formData() {
  return {
    name: elements.name.value.trim() || 'ශිෂ්‍යයාගේ නම',
    examNumber: elements.examNumber.value.trim() || 'විභාග අංකය',
    admissionDate: elements.admissionDate.value ? formatDate(elements.admissionDate.value) : 'ඇතුළත් වූ දිනය',
    dob: elements.dob.value ? formatDate(elements.dob.value) : 'උපන් දිනය',
    number: elements.number.value.trim() || getNextStudentNumber(),
  };
}

function formatDate(value) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function fitText(ctx, text, maxWidth, startSize, weight = 600) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px "Noto Sans Sinhala", "Segoe UI", Arial, sans-serif`;
    size -= 1;
  } while (ctx.measureText(text).width > maxWidth && size > 18);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 20);
  ctx.clip();
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  ctx.restore();
}

function compressPhoto(image) {
  const canvas = document.createElement('canvas');
  const maxWidth = 600;
  const maxHeight = 800;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .82);
}

function drawDataValue(ctx, value, x, y, maxWidth = 430) {
  ctx.fillStyle = '#24103c';
  fitText(ctx, value, maxWidth, 40, 700);
  ctx.fillText(value, x, y - 12);
}

function drawFront() {
  const ctx = elements.front.getContext('2d');
  const data = formData();
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.drawImage(frontBackground, 0, 0, CARD_WIDTH, CARD_HEIGHT);

  if (state.photo) {
    drawCoverImage(ctx, state.photo, 87, 785, 226, 301);
  }

  drawDataValue(ctx, data.name, 80, 724, 670);
  drawDataValue(ctx, data.examNumber, 365, 827, 410);
  drawDataValue(ctx, data.admissionDate, 365, 895, 410);
  drawDataValue(ctx, data.dob, 365, 996, 410);
}

function drawBack() {
  const ctx = elements.back.getContext('2d');
  const number = formData().number;
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.drawImage(backBackground, 0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, 202, 805, 410, 171, 28);

  const barcodeCanvas = document.createElement('canvas');
  JsBarcode(barcodeCanvas, number, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    width: 2,
    height: 92,
    background: '#ffffff',
    lineColor: '#111111',
  });
  ctx.drawImage(barcodeCanvas, 228, 826, 358, 104);
  ctx.fillStyle = '#140d1c';
  ctx.textAlign = 'center';
  fitText(ctx, number, 355, 27, 650);
  ctx.fillText(number, 407, 960);
  ctx.textAlign = 'left';
}

function renderCards() {
  drawFront();
  drawBack();
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function downloadPdf() {
  renderCards();
  const pdf = await PDFDocument.create();
  const pageWidth = MM_WIDTH * 72 / 25.4;
  const pageHeight = MM_HEIGHT * 72 / 25.4;
  for (const canvas of [elements.front, elements.back]) {
    const image = await pdf.embedPng(canvas.toDataURL('image/png'));
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  }
  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(formData().number)}-two-sided.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value) {
  return value.replaceAll('/', '-').replace(/[^a-zA-Z0-9-_]/g, '');
}

function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function updateSelectionControls() {
  const selectedCount = state.selectedIds.size;
  elements.deleteSelected.disabled = selectedCount === 0;
  elements.deleteSelected.textContent = selectedCount ? `Delete selected (${selectedCount})` : 'Delete selected';
  elements.selectAll.checked = state.records.length > 0 && selectedCount === state.records.length;
  elements.selectAll.indeterminate = selectedCount > 0 && selectedCount < state.records.length;
}

function renderRecords() {
  elements.recordCount.textContent = `${state.records.length} saved locally`;
  if (!state.records.length) {
    elements.recordsList.innerHTML = '<div class="empty-state">Saved students will appear here for quick reprinting.</div>';
    state.selectedIds.clear();
    updateSelectionControls();
    return;
  }
  elements.recordsList.innerHTML = state.records.map((record) => `
    <div class="record ${state.editingId === record.id ? 'editing' : ''}" data-record-id="${record.id}">
      <input class="record-check" type="checkbox" data-select-id="${record.id}" ${state.selectedIds.has(record.id) ? 'checked' : ''} aria-label="Select ${escapeHtml(record.name)}" />
      <span class="record-avatar">${escapeHtml(record.name.charAt(0).toUpperCase())}</span>
      <button class="record-details" type="button" data-action="open" data-id="${record.id}">
        <strong>${escapeHtml(record.name)}</strong>
        <small>${escapeHtml(record.examNumber || 'No exam number')} · ${escapeHtml(record.number)}</small>
      </button>
      <time>${escapeHtml(record.savedAt)}</time>
      <div class="record-actions">
        <button type="button" data-action="edit" data-id="${record.id}">Edit</button>
        <button class="danger-link" type="button" data-action="delete" data-id="${record.id}">Delete</button>
      </div>
    </div>
  `).join('');
  updateSelectionControls();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function loadRecord(record) {
  elements.name.value = record.name;
  elements.examNumber.value = record.examNumber || '';
  elements.admissionDate.value = record.rawAdmissionDate || '';
  elements.dob.value = record.rawDob;
  elements.number.value = record.number;
  if (record.photo) {
    state.photoData = record.photo;
    loadImage(record.photo).then((image) => { state.photo = image; renderCards(); });
  } else {
    state.photo = null;
    state.photoData = null;
  }
  renderCards();
}

function beginEdit(record) {
  state.editingId = record.id;
  loadRecord(record);
  elements.saveStudent.textContent = 'Update student & regenerate card';
  renderRecords();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetEditor() {
  elements.form.reset();
  elements.number.value = getNextStudentNumber();
  state.photo = null;
  state.photoData = null;
  state.editingId = null;
  elements.saveStudent.textContent = 'Save student & generate card';
  elements.uploadZone.classList.remove('has-photo');
  elements.uploadZone.querySelector('strong').textContent = 'Upload student photo';
  renderCards();
  renderRecords();
}

function deleteRecords(ids) {
  const idSet = new Set(ids);
  state.records = state.records.filter((record) => !idSet.has(record.id));
  ids.forEach((id) => state.selectedIds.delete(id));
  if (state.editingId && idSet.has(state.editingId)) resetEditor();
  persistRecords();
  renderRecords();
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + value);
    return excelEpoch.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  const localMatch = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (localMatch) return `${localMatch[3]}-${localMatch[2].padStart(2, '0')}-${localMatch[1].padStart(2, '0')}`;
  return '';
}

function createImportedRecord(row) {
  const name = String(row.name || row['නම'] || '').trim();
  if (!name) return null;
  const rawAdmissionDate = normalizeDate(row.admissionDate || row['ඇතුළත් වූ දිනය']);
  const rawDob = normalizeDate(row.dob || row.dateOfBirth || row['උපන් දිනය']);
  let generatedNumber = '';
  if (!row.studentNumber && !row.number && !row['ශිෂ්‍ය අංකය']) {
    const sequence = Number(localStorage.getItem(SEQUENCE_KEY) || 1);
    generatedNumber = `PIR/ABP/${new Date().getFullYear()}/${String(sequence).padStart(4, '0')}`;
    localStorage.setItem(SEQUENCE_KEY, String(sequence + 1));
  }
  const number = String(row.studentNumber || row.number || row['ශිෂ්‍ය අංකය'] || generatedNumber).trim();
  return {
    id: crypto.randomUUID(),
    name,
    examNumber: String(row.examNumber || row['විභාග අංකය'] || '').trim(),
    admissionDate: rawAdmissionDate ? formatDate(rawAdmissionDate) : '',
    dob: rawDob ? formatDate(rawDob) : '',
    rawAdmissionDate,
    rawDob,
    number,
    photo: null,
    savedAt: new Date().toLocaleDateString(),
  };
}

function mergeImportedRecords(records) {
  const existingByNumber = new Map(state.records.map((record) => [record.number, record]));
  records.forEach((record) => existingByNumber.set(record.number, {
    ...existingByNumber.get(record.number),
    ...record,
    id: existingByNumber.get(record.number)?.id || record.id,
  }));
  state.records = [...existingByNumber.values()];
  const largestSequence = state.records.reduce((largest, record) => {
    const sequence = Number(String(record.number).split('/').at(-1));
    return Number.isFinite(sequence) ? Math.max(largest, sequence) : largest;
  }, 0);
  const currentSequence = Number(localStorage.getItem(SEQUENCE_KEY) || 1);
  if (largestSequence) localStorage.setItem(SEQUENCE_KEY, String(Math.max(currentSequence, largestSequence + 1)));
  persistRecords();
  renderRecords();
}

document.querySelectorAll('input').forEach((input) => input.addEventListener('input', renderCards));

elements.photoInput.addEventListener('change', () => {
  const [file] = elements.photoInput.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const original = await loadImage(reader.result);
    state.photoData = compressPhoto(original);
    state.photo = await loadImage(state.photoData);
    elements.uploadZone.classList.add('has-photo');
    elements.uploadZone.querySelector('strong').textContent = file.name;
    renderCards();
  };
  reader.readAsDataURL(file);
});

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  renderCards();
  const data = formData();
  const record = {
    ...data,
    rawAdmissionDate: elements.admissionDate.value,
    rawDob: elements.dob.value,
    id: state.editingId || crypto.randomUUID(),
    photo: state.photoData,
    savedAt: new Date().toLocaleDateString(),
  };
  state.records = [record, ...state.records.filter((item) => item.id !== record.id && item.number !== record.number)];
  persistRecords();
  const currentSequence = Number(record.number.split('/').at(-1));
  const storedSequence = Number(localStorage.getItem(SEQUENCE_KEY) || 1);
  if (Number.isFinite(currentSequence)) {
    localStorage.setItem(SEQUENCE_KEY, String(Math.max(storedSequence, currentSequence + 1)));
  }
  resetEditor();
});

document.querySelector('#refreshNumber').addEventListener('click', () => {
  elements.number.value = getNextStudentNumber(true);
  renderCards();
});

document.querySelector('#resetForm').addEventListener('click', () => {
  resetEditor();
});

document.querySelectorAll('[data-side]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-side]').forEach((item) => item.classList.toggle('active', item === button));
  const front = button.dataset.side === 'front';
  elements.front.hidden = !front;
  elements.back.hidden = front;
}));

document.querySelector('#frontPng').addEventListener('click', () => {
  renderCards();
  downloadCanvas(elements.front, `${safeFilename(formData().number)}-front.png`);
});
document.querySelector('#backPng').addEventListener('click', () => {
  renderCards();
  downloadCanvas(elements.back, `${safeFilename(formData().number)}-back.png`);
});
document.querySelector('#twoSidePdf').addEventListener('click', downloadPdf);
elements.recordsList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-select-id]');
  if (!checkbox) return;
  if (checkbox.checked) state.selectedIds.add(checkbox.dataset.selectId);
  else state.selectedIds.delete(checkbox.dataset.selectId);
  updateSelectionControls();
});

elements.recordsList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const record = state.records.find((item) => item.id === button.dataset.id);
  if (!record) return;
  if (button.dataset.action === 'delete') {
    if (confirm(`Delete ${record.name}?`)) deleteRecords([record.id]);
    return;
  }
  if (button.dataset.action === 'edit') beginEdit(record);
  else loadRecord(record);
});

elements.selectAll.addEventListener('change', () => {
  state.selectedIds = elements.selectAll.checked
    ? new Set(state.records.map((record) => record.id))
    : new Set();
  renderRecords();
});

elements.deleteSelected.addEventListener('click', () => {
  if (!state.selectedIds.size) return;
  if (confirm(`Delete ${state.selectedIds.size} selected student records?`)) {
    deleteRecords([...state.selectedIds]);
  }
});

document.querySelector('#exportJson').addEventListener('click', () => {
  const backup = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records: state.records }, null, 2);
  downloadBlob(new Blob([backup], { type: 'application/json' }), 'piriven-students-backup.json');
});

elements.importJson.addEventListener('change', async () => {
  const [file] = elements.importJson.files;
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const imported = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(imported)) throw new Error('Invalid backup format');
    const validRecords = imported.filter((record) => record?.name && record?.number).map((record) => ({
      ...record,
      id: record.id || crypto.randomUUID(),
      savedAt: record.savedAt || new Date().toLocaleDateString(),
    }));
    mergeImportedRecords(validRecords);
    alert(`${validRecords.length} student records imported.`);
  } catch (error) {
    alert(`JSON import failed: ${error.message}`);
  } finally {
    elements.importJson.value = '';
  }
});

document.querySelector('#exportExcel').addEventListener('click', async () => {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');
  sheet.columns = [
    { header: 'name', key: 'name', width: 32 },
    { header: 'examNumber', key: 'examNumber', width: 20 },
    { header: 'admissionDate', key: 'admissionDate', width: 18 },
    { header: 'dob', key: 'dob', width: 18 },
    { header: 'studentNumber', key: 'studentNumber', width: 25 },
  ];
  state.records.forEach((record) => sheet.addRow({
    name: record.name,
    examNumber: record.examNumber || '',
    admissionDate: record.rawAdmissionDate || '',
    dob: record.rawDob || '',
    studentNumber: record.number,
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A086D' } };
  sheet.autoFilter = 'A1:E1';
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'piriven-students.xlsx');
});

elements.importExcel.addEventListener('change', async () => {
  const [file] = elements.importExcel.files;
  if (!file) return;
  try {
    const module = await import('exceljs');
    const ExcelJS = module.default || module;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('The workbook has no worksheet');
    const headers = sheet.getRow(1).values.slice(1).map((value) => String(value || '').trim());
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const data = {};
      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1);
        data[header] = cell.value?.text || cell.value?.result || cell.value || '';
      });
      const record = createImportedRecord(data);
      if (record) rows.push(record);
    });
    mergeImportedRecords(rows);
    alert(`${rows.length} students imported from Excel.`);
  } catch (error) {
    alert(`Excel import failed: ${error.message}`);
  } finally {
    elements.importExcel.value = '';
  }
});

renderCards();
renderRecords();
