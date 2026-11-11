import {BOM_LOAD_ERROR, currentBom} from './bom.js';
import {BOM_STORAGE_KEY, MAX_BOM_BYTES, parseBom, SLOT_KINDS, validateBom} from './bom-format.mjs';
import {TARGET, WARN} from './model.js';

const CSS = `
.bom-dashboard{position:fixed;z-index:100;right:16px;top:12px;width:390px;max-width:calc(100vw - 32px);font:13px/1.45 Inter,system-ui,sans-serif;color:#16181b;background:#f8f8f9;border:1px solid #c9ccd0;box-shadow:0 4px 20px #0002;border-radius:6px}
.bom-dashboard summary{cursor:pointer;padding:10px 14px;font-weight:700}
.bom-dashboard .dash-body{padding:0 14px 14px;max-height:calc(100dvh - 100px);overflow:auto}
.bom-dashboard fieldset{margin:12px 0;padding:10px;border:1px solid #c9ccd0;min-width:0}
.bom-dashboard legend{font-weight:600}
.bom-dashboard label{display:block;margin:7px 0}
.bom-dashboard input:not([type=checkbox]),.bom-dashboard select{display:block;box-sizing:border-box;width:100%;padding:6px;border:1px solid #a9aeb5;border-radius:3px;background:#fff;color:#16181b;font:inherit}
.bom-dashboard input[type=checkbox]{vertical-align:middle}
.bom-dashboard button{padding:7px 10px;margin:4px 5px 0 0;border:1px solid #8b8f95;border-radius:3px;background:white;color:#16181b;cursor:pointer;font:inherit}
.bom-dashboard button[type=submit]{background:#16181b;color:white}
.bom-dashboard .dash-status{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}
.bom-dashboard [data-error=true]{color:#a11612}
.bom-dashboard .dash-note{font-size:12px;color:#555b63}
.bom-dashboard .dash-row{display:grid;grid-template-columns:1fr 65px;gap:8px;align-items:end}
.bom-dashboard h3{margin:10px 0 2px;font-size:13px}
`;
const LABELS = {cpu: 'CPU', memory: 'Memory', gpu: 'GPU', drives: 'Drives', fans: 'Fans', psu: 'PSUs', nics: 'NICs', ocp: 'OCP', boot: 'Boot'};
const MAX_COUNT = {cpu: 4, gpu: 16, psu: 8, fans: 16};
const node = (tag, text) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
};

export function createDashboard({onRiskVisibility, onInteract}) {
  const style = node('style', CSS);
  document.head.appendChild(style);
  const root = node('details');
  root.className = 'bom-dashboard';
  const summary = node('summary', 'Rack dashboard');
  root.appendChild(summary);
  const body = node('div');
  body.className = 'dash-body';
  root.appendChild(body);
  const note = node('p', 'Changes stay in this browser tab. Apply reloads the scene. The published default and other viewers are unchanged.');
  note.className = 'dash-note';
  body.appendChild(note);
  const riskLabel = node('label');
  const riskCheck = node('input');
  riskCheck.type = 'checkbox';
  riskCheck.checked = true;
  riskLabel.append(riskCheck, document.createTextNode(' Show risk signals and red highlights'));
  body.appendChild(riskLabel);
  riskCheck.addEventListener('change', () => onRiskVisibility(riskCheck.checked));
  const riskNote = node('p', 'Hiding risks does not clear them or disconnect external tools. The RISK overlay isolates flagged parts; this checkbox controls visibility everywhere.');
  riskNote.className = 'dash-note';
  body.appendChild(riskNote);
  const form = node('form');
  body.appendChild(form);
  const editor = node('div');
  form.appendChild(editor);
  const apply = node('button', 'Apply BOM and reload');
  apply.type = 'submit';
  form.appendChild(apply);
  const exportButton = node('button', 'Export JSON');
  exportButton.type = 'button';
  form.appendChild(exportButton);
  const uploadLabel = node('label', 'Upload BOM (.json, teardown-bom v1, max 256 KiB)');
  const upload = node('input');
  upload.type = 'file';
  upload.accept = '.json,application/json';
  uploadLabel.appendChild(upload);
  body.appendChild(uploadLabel);
  const importNote = node('p', 'Uploads are validated and staged in the editor before applying. Export the current BOM for a complete editable template. Scripts, spreadsheets, and arbitrary vendor JSON are not accepted.');
  importNote.className = 'dash-note';
  body.appendChild(importNote);
  const reset = node('button', 'Reset to published BOM');
  reset.type = 'button';
  body.appendChild(reset);
  const status = node('p');
  status.className = 'dash-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  body.appendChild(status);
  const warnings = node('p', WARN.length ? `Layout warnings:\n${WARN.join('\n')}` : 'No layout warnings for the active BOM.');
  warnings.className = 'dash-note';
  body.appendChild(warnings);
  document.body.appendChild(root);
  let draft = currentBom();
  const report = (message, error = false) => {
    status.textContent = message;
    status.dataset.error = String(error);
  };
  const edited = () => report('Unapplied changes. Apply to rebuild the scene, or export the draft.');
  const fieldset = (title) => {
    const box = node('fieldset');
    box.appendChild(node('legend', title));
    editor.appendChild(box);
    return box;
  };
  const input = (parent, label, value, update, {type = 'text', maxLength = 100, min = 0, max = 32} = {}) => {
    const wrap = node('label', label);
    const control = node('input');
    control.type = type;
    control.value = value;
    if (type === 'text') control.maxLength = maxLength;
    if (type === 'number') {
      control.min = min;
      control.max = max;
      control.step = 1;
    }
    control.required = type === 'number';
    control.addEventListener('input', () => {
      update(type === 'number' ? control.valueAsNumber : control.value);
      edited();
    });
    wrap.appendChild(control);
    parent.appendChild(wrap);
    return control;
  };
  const drawEditor = () => {
    editor.replaceChildren();
    const brand = fieldset('Branding');
    input(brand, 'Display title', draft.title.name, (v) => { draft.title.name = v; });
    input(brand, 'Subtitle', draft.title.sub, (v) => { draft.title.sub = v; });
    input(brand, 'Rack / server badge text', draft.title.brand, (v) => { draft.title.brand = v; }, {maxLength: 24});
    input(brand, 'Badge color', draft.title.badgeColor, (v) => { draft.title.badgeColor = v; }, {type: 'color'});
    const cabinet = draft.catalog[draft.rack.part];
    input(brand, 'Cabinet name', cabinet.name, (v) => { cabinet.name = v; }, {maxLength: 160});
    const target = draft.rack.layout.find((d) => d.target);
    const server = draft.servers[target.server];
    const parts = fieldset(`Teardown server: ${server.name}`);
    const shared = node('p', 'Edits affect every rack node using this server configuration. New SKUs, rack layouts, and server types can be supplied through JSON.');
    shared.className = 'dash-note';
    parts.appendChild(shared);
    input(parts, 'Server name', server.name, (v) => { server.name = v; });
    input(parts, 'Server description', server.sub, (v) => { server.sub = v; }, {maxLength: 160});
    for (const [slot, kind] of Object.entries(SLOT_KINDS)) {
      const config = server[slot];
      if (!config) continue;
      const row = node('div');
      row.className = 'dash-row';
      const label = node('label', LABELS[slot]);
      const select = node('select');
      for (const [id, part] of Object.entries(draft.catalog)) {
        if (part.kind !== kind) continue;
        const option = node('option', part.name);
        option.value = id;
        select.appendChild(option);
      }
      select.value = config.part;
      select.addEventListener('change', () => {
        config.part = select.value;
        drawEditor();
        edited();
      });
      label.appendChild(select);
      row.appendChild(label);
      if (!['ocp', 'boot'].includes(slot)) {
        const countKey = slot === 'memory' ? 'perCpu' : 'count';
        input(row, slot === 'memory' ? '/ CPU' : 'Qty', config[countKey], (v) => { config[countKey] = v; },
          {type: 'number', min: slot === 'cpu' || slot === 'psu' ? 1 : 0, max: MAX_COUNT[slot] || 32});
      }
      parts.appendChild(row);
      const detail = node('details');
      detail.appendChild(node('summary', `Edit ${LABELS[slot]} SKU details`));
      const part = draft.catalog[config.part];
      const skuNote = node('p', `SKU: ${config.part}. Changes affect every occurrence of this SKU. Keep names and spec rows consistent in exported JSON.`);
      skuNote.className = 'dash-note';
      detail.appendChild(skuNote);
      input(detail, 'Part name', part.name, (v) => { part.name = v; }, {maxLength: 160});
      if (['gpu', 'cpu'].includes(slot)) {
        input(detail, 'Printed part label', part.label || part.name, (v) => { part.label = v; }, {maxLength: 48});
      }
      if (slot === 'gpu') input(detail, 'GPU vendor label', part.vendor || '', (v) => { part.vendor = v; }, {maxLength: 48});
      if (part.watts !== undefined) input(detail, 'Maximum watts per part', part.watts, (v) => { part.watts = v; }, {type: 'number', max: 100000});
      parts.appendChild(detail);
    }
  };
  drawEditor();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const bom = validateBom(draft);
      const serialized = JSON.stringify(bom);
      parseBom(serialized);
      sessionStorage.setItem(BOM_STORAGE_KEY, serialized);
      location.reload();
    } catch (error) {
      report(`BOM not applied: ${error.message}`, true);
    }
  });
  upload.addEventListener('change', async () => {
    const file = upload.files[0];
    if (!file) return;
    apply.disabled = true;
    try {
      if (!/\.json$/i.test(file.name)) throw new Error('only .json files are accepted');
      if (file.size > MAX_BOM_BYTES) throw new Error('file exceeds 256 KiB');
      const imported = parseBom(await file.text());
      draft = imported;
      drawEditor();
      report(`Loaded ${file.name} into the editor. Review it, then Apply BOM and reload.`);
    } catch (error) {
      report(`Upload rejected: ${error.message}. Your previous draft and active rack are unchanged.`, true);
    } finally {
      apply.disabled = false;
      upload.value = '';
    }
  });
  exportButton.addEventListener('click', () => {
    try {
      const bom = validateBom(draft);
      const serialized = JSON.stringify(bom, null, 2);
      parseBom(serialized);
      const url = URL.createObjectURL(new Blob([serialized], {type: 'application/json'}));
      const link = node('a');
      link.href = url;
      link.download = 'teardown-bom-v1.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      report('Exported the validated draft as teardown-bom-v1.json.');
    } catch (error) {
      report(`Export rejected: ${error.message}`, true);
    }
  });
  reset.addEventListener('click', () => {
    if (!confirm('Discard edits and restore the published BOM? The scene will reload.')) return;
    try {
      sessionStorage.removeItem(BOM_STORAGE_KEY);
      location.reload();
    } catch (error) {
      report(`Reset failed: ${error.message}`, true);
    }
  });
  root.addEventListener('toggle', onInteract);
  root.addEventListener('input', onInteract);
  root.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    onInteract();
  });
  root.addEventListener('keydown', (event) => event.stopPropagation());
  if (BOM_LOAD_ERROR) {
    root.open = true;
    report(BOM_LOAD_ERROR, true);
  } else {
    report(`Active target: ${TARGET.name}. Export JSON to start a new BOM.`);
  }
  return {get isOpen() { return root.open; }};
}
