// Cover Coast Studio — an offline cover art maker.
// Everything runs on the person's own machine: photos are read locally,
// the cover is drawn on a canvas, and the PNG export never leaves the page.

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ sizes

// The three post sizes the app exports, in pixels.
const SIZES = {
  wide: { label: 'Landscape 1920 x 1080', w: 1920, h: 1080 },
  square: { label: 'Square 1080 x 1080', w: 1080, h: 1080 },
  tall: { label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
};

// ------------------------------------------------------------------ layouts

// Each layout returns its panel rectangles inside the framed area
// (ix, iy, iw, ih) with gutter g between panels. Panels are plain
// {x, y, w, h} rectangles in cover pixels.
const LAYOUTS = {
  hero: {
    label: 'Hero + Trio',
    panels(ix, iy, iw, ih, g) {
      const heroW = Math.round(iw * 0.6);
      const rx = ix + heroW + g;
      const rw = iw - heroW - g;
      const rh = Math.floor((ih - 2 * g) / 3);
      return [
        { x: ix, y: iy, w: heroW, h: ih },
        { x: rx, y: iy, w: rw, h: rh },
        { x: rx, y: iy + rh + g, w: rw, h: rh },
        { x: rx, y: iy + 2 * (rh + g), w: rw, h: ih - 2 * (rh + g) },
      ];
    },
  },
  grid: {
    label: 'Four Panels',
    panels(ix, iy, iw, ih, g) {
      const cw = Math.floor((iw - g) / 2);
      const ch = Math.floor((ih - g) / 2);
      return [
        { x: ix, y: iy, w: cw, h: ch },
        { x: ix + cw + g, y: iy, w: iw - cw - g, h: ch },
        { x: ix, y: iy + ch + g, w: cw, h: ih - ch - g },
        { x: ix + cw + g, y: iy + ch + g, w: iw - cw - g, h: ih - ch - g },
      ];
    },
  },
  bleed: {
    label: 'Full Bleed',
    panels(ix, iy, iw, ih) {
      return [{ x: ix, y: iy, w: iw, h: ih }];
    },
  },
  strip: {
    label: 'Triple Strip',
    panels(ix, iy, iw, ih, g) {
      const pw = Math.floor((iw - 2 * g) / 3);
      return [
        { x: ix, y: iy, w: pw, h: ih },
        { x: ix + pw + g, y: iy, w: pw, h: ih },
        { x: ix + 2 * (pw + g), y: iy, w: iw - 2 * (pw + g), h: ih },
      ];
    },
  },
  banner: {
    label: 'Banner + Trio',
    panels(ix, iy, iw, ih, g) {
      const th = Math.round(ih * 0.58);
      const bw = Math.floor((iw - 2 * g) / 3);
      const by = iy + th + g;
      const bh = ih - th - g;
      return [
        { x: ix, y: iy, w: iw, h: th },
        { x: ix, y: by, w: bw, h: bh },
        { x: ix + bw + g, y: by, w: bw, h: bh },
        { x: ix + 2 * (bw + g), y: by, w: iw - 2 * (bw + g), h: bh },
      ];
    },
  },
};

// ------------------------------------------------------------------ grades

// A grade is a list of colour washes drawn over the photos, each with a
// blend mode and an alpha, plus an optional grey step for the noir grade.
const GRADES = {
  sunset: {
    label: 'Sunset',
    washes: [
      { stops: [[0, '#ff9a3c'], [1, '#ff2e63']], mode: 'soft-light', alpha: 0.6 },
      { stops: [[0, '#ffb347'], [1, '#ff5e78']], mode: 'overlay', alpha: 0.25 },
    ],
  },
  neon: {
    label: 'Neon',
    washes: [
      { stops: [[0, '#ff2ea6'], [1, '#00e5ff']], mode: 'overlay', alpha: 0.5 },
      { stops: [[0, '#2b0a3d'], [1, '#00323d']], mode: 'multiply', alpha: 0.35 },
    ],
  },
  palm: {
    label: 'Palm',
    washes: [
      { stops: [[0, '#0b3d3a'], [1, '#ff8c42']], mode: 'soft-light', alpha: 0.68 },
      { stops: [[0, '#0e5f5a'], [1, '#ffd23f']], mode: 'overlay', alpha: 0.3 },
    ],
  },
  vice: {
    label: 'Vice',
    washes: [
      { stops: [[0, '#7b2ff7'], [1, '#f7b32b']], mode: 'overlay', alpha: 0.45 },
      { stops: [[0, '#3d0a5e'], [1, '#5e2a00']], mode: 'multiply', alpha: 0.3 },
    ],
  },
  noir: {
    label: 'Noir',
    grey: true,
    washes: [
      { stops: [[0, '#ffffff'], [1, '#888888']], mode: 'soft-light', alpha: 0.25 },
    ],
  },
};

// ------------------------------------------------------------------ state

const SAMPLES = {
  pier: 'samples/pier.jpg',
  boulevard: 'samples/boulevard.jpg',
};

const state = {
  layout: 'hero',
  grade: 'sunset',
  previewSize: 'wide',
  title: 'SUNSET HEIST',
  subtitle: 'Neon nights',
  titleColour: '#ffffff',
  subtitleColour: '#ff5ea8',
  selectedPanel: 0,
  // One entry per panel slot; a layout with fewer panels uses the first ones.
  // Each slot frames the same photo differently, so one photo spread over
  // several panels still reads as a poster, not a repeated tile.
  panels: [
    { photo: 'pier', zoom: 1, ox: -0.3, oy: 0.03 },
    { photo: 'boulevard', zoom: 1.05, ox: 0.3, oy: 0.45 },
    { photo: 'pier', zoom: 1.15, ox: 0, oy: 0.35 },
    { photo: 'boulevard', zoom: 1.1, ox: -0.1, oy: 0.45 },
  ],
};

// Loaded images by photo id: 'pier', 'boulevard', or an upload id like 'up0'.
const photos = new Map();
let uploadCount = 0;

// ------------------------------------------------------------------ photos

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + src));
    img.src = src;
  });
}

async function loadPhoto(id) {
  if (photos.has(id)) return photos.get(id);
  const src = SAMPLES[id];
  if (!src) throw new Error('unknown photo ' + id);
  const img = await loadImage(src);
  photos.set(id, img);
  return img;
}

async function loadAllStatePhotos() {
  const ids = new Set(state.panels.map((p) => p.photo));
  await Promise.all([...ids].map((id) => loadPhoto(id).catch(() => null)));
}

function addUpload(file) {
  const id = 'up' + uploadCount;
  uploadCount += 1;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  photos.set(id, img);
  const thumb = document.createElement('button');
  thumb.type = 'button';
  thumb.className = 'sample-btn upload-btn-thumb';
  thumb.textContent = file.name.length > 14 ? file.name.slice(0, 12) + '…' : file.name;
  thumb.dataset.photo = id;
  thumb.addEventListener('click', () => {
    setPanelPhoto(state.selectedPanel, id);
    markActiveThumb();
    renderPreview();
  });
  $('uploadRow').appendChild(thumb);
  return new Promise((resolve) => {
    img.onload = () => resolve(id);
    img.onerror = () => resolve(id);
  });
}

function setPanelPhoto(panelIndex, photoId) {
  state.panels[panelIndex].photo = photoId;
}

function fillAllPanels(photoId) {
  for (const panel of state.panels) panel.photo = photoId;
}

// ------------------------------------------------------------------ rendering

// A fixed-seed noise tile, drawn over the cover for a printed-poster grain.
let grainTile = null;
function makeGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const g = tile.getContext('2d');
  const data = g.createImageData(128, 128);
  let seed = 20261120;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed % 256;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  grainTile = tile;
  return tile;
}

// Draw one photo into a panel rect, cropped to fill, with the panel's
// zoom and pan. The photo is centred, then shifted by ox/oy in panel units.
function drawCoverPhoto(ctx, img, r, panel, grey) {
  const scale = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight) * panel.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  let dx = r.x + (r.w - dw) / 2 + panel.ox * r.w;
  let dy = r.y + (r.h - dh) / 2 + panel.oy * r.h;
  // Pin the photo so it always covers the panel: a pan or zoom can never
  // open a white gap at a panel edge.
  if (dw > r.w) dx = Math.max(r.x + r.w - dw, Math.min(r.x, dx));
  else dx = r.x + (r.w - dw) / 2;
  if (dh > r.h) dy = Math.max(r.y + r.h - dh, Math.min(r.y, dy));
  else dy = r.y + (r.h - dh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  if (grey) ctx.filter = 'grayscale(1) contrast(1.18) brightness(1.03)';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function applyGradeWashes(ctx, W, H, grade) {
  for (const wash of grade.washes) {
    const grad = ctx.createLinearGradient(0, 0, W * 0.35, H);
    for (const [stop, colour] of wash.stops) grad.addColorStop(stop, colour);
    ctx.save();
    ctx.globalAlpha = wash.alpha;
    ctx.globalCompositeOperation = wash.mode;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function applyVignette(ctx, W, H) {
  const grad = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.35,
    W / 2, H / 2, Math.max(W, H) * 0.75,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function applyGrain(ctx, W, H) {
  const tile = makeGrainTile();
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// The caption band: a dark scrim at the bottom, the big title in the
// display font with a hard outline, and the script subtitle under it.
function drawCaption(ctx, W, H) {
  const bandH = Math.round(H * 0.22);
  const grad = ctx.createLinearGradient(0, H - bandH, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - bandH, W, bandH);

  const title = (state.title || 'UNTITLED').toUpperCase();
  let size = Math.round(H * 0.115);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = size + "px Anton, 'Arial Black', sans-serif";
  while (size > 20 && ctx.measureText(title).width > W * 0.9) {
    size -= 2;
    ctx.font = size + "px Anton, 'Arial Black', sans-serif";
  }
  const titleY = H - Math.round(bandH * 0.34);
  ctx.save();
  ctx.translate(W / 2, titleY);
  ctx.rotate(-0.018);
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111111';
  ctx.strokeText(title, 0, 0);
  ctx.fillStyle = state.titleColour;
  ctx.fillText(title, 0, 0);
  ctx.restore();

  const subtitle = (state.subtitle || '').trim();
  if (subtitle) {
    const subSize = Math.round(H * 0.042);
    ctx.font = subSize + "px Pacifico, cursive";
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = Math.round(subSize * 0.25);
    ctx.fillStyle = state.subtitleColour;
    ctx.fillText(subtitle, W / 2, H - Math.round(bandH * 0.1));
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// Draw the whole cover into ctx at W x H. When preview is true, the
// selected panel gets a dashed outline and each panel a number badge,
// so the editor shows what can be grabbed; exports never carry them.
function renderCover(ctx, W, H, preview) {
  const frame = Math.round(Math.min(W, H) * 0.02);
  const gutter = Math.round(Math.min(W, H) * 0.012);
  const ix = frame;
  const iy = frame;
  const iw = W - 2 * frame;
  const ih = H - 2 * frame;
  const layout = LAYOUTS[state.layout];
  const rects = layout.panels(ix, iy, iw, ih, gutter);
  const grade = GRADES[state.grade];

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < rects.length; i += 1) {
    const img = photos.get(state.panels[i].photo);
    if (!img || !img.naturalWidth) {
      ctx.fillStyle = '#22222e';
      ctx.fillRect(rects[i].x, rects[i].y, rects[i].w, rects[i].h);
      continue;
    }
    drawCoverPhoto(ctx, img, rects[i], state.panels[i], grade.grey === true);
  }

  applyGradeWashes(ctx, W, H, grade);
  applyVignette(ctx, W, H);
  applyGrain(ctx, W, H);
  drawCaption(ctx, W, H);

  // A thin dark hairline just inside the white frame, for a poster edge.
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(1, Math.round(Math.min(W, H) * 0.002));
  ctx.strokeRect(frame / 2, frame / 2, W - frame, H - frame);

  if (preview) {
    const sel = rects[state.selectedPanel];
    if (sel) {
      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = Math.max(2, Math.round(Math.min(W, H) * 0.004));
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(sel.x + 2, sel.y + 2, sel.w - 4, sel.h - 4);
      ctx.restore();
    }
    ctx.save();
    ctx.font = Math.round(H * 0.03) + "px system-ui, sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      const badge = Math.round(H * 0.045);
      ctx.fillStyle = i === state.selectedPanel ? '#00e5ff' : 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.arc(r.x + badge * 0.7, r.y + badge * 0.7, badge / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = i === state.selectedPanel ? '#111111' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), r.x + badge * 0.7, r.y + badge * 0.7 + 1);
    }
    ctx.restore();
  }
  ctx.restore();
}

// Panel rectangles for the current preview size, in preview-canvas pixels.
function previewRects(canvas) {
  const frame = Math.round(Math.min(canvas.width, canvas.height) * 0.02);
  const gutter = Math.round(Math.min(canvas.width, canvas.height) * 0.012);
  return LAYOUTS[state.layout].panels(
    frame, frame,
    canvas.width - 2 * frame, canvas.height - 2 * frame,
    gutter,
  );
}

// ------------------------------------------------------------------ preview

const previewCanvas = $('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

function renderPreview() {
  const size = SIZES[state.previewSize];
  const maxDim = 900;
  const scale = Math.min(1, maxDim / Math.max(size.w, size.h));
  previewCanvas.width = Math.round(size.w * scale);
  previewCanvas.height = Math.round(size.h * scale);
  renderCover(previewCtx, previewCanvas.width, previewCanvas.height, true);
  syncPanelControls();
}

function syncPanelControls() {
  const panel = state.panels[state.selectedPanel];
  $('panelName').textContent = String(state.selectedPanel + 1);
  $('zoomSlider').value = String(panel.zoom);
  $('panXSlider').value = String(panel.ox);
  $('panYSlider').value = String(panel.oy);
}

function markActiveThumb() {
  const current = state.panels[state.selectedPanel].photo;
  for (const btn of document.querySelectorAll('[data-photo]')) {
    btn.classList.toggle('active', btn.dataset.photo === current);
  }
}

// Bring every control row in line with the current state (layout, grade,
// preview size, caption colours, selected panel). Used after shot
// parameters are applied, so the editor never shows a stale selection.
function syncControlStates() {
  const setActive = (rowId, attr, value) => {
    for (const btn of $(rowId).querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset[attr] === value);
    }
  };
  setActive('layoutRow', 'layout', state.layout);
  setActive('gradeRow', 'grade', state.grade);
  setActive('sizeRow', 'size', state.previewSize);
  $('titleInput').value = state.title;
  $('subtitleInput').value = state.subtitle;
  $('titleColour').value = state.titleColour;
  $('subtitleColour').value = state.subtitleColour;
  markActiveThumb();
  syncPanelControls();
}

// ------------------------------------------------------------------ export

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('export produced no image'));
    }, 'image/png');
  });
}

// Render the cover at an exact post size and hand back its PNG blob.
async function exportPNG(sizeName) {
  const size = SIZES[sizeName];
  if (!size) throw new Error('unknown size ' + sizeName);
  await fontsReady;
  await loadAllStatePhotos();
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  renderCover(off.getContext('2d'), size.w, size.h, false);
  return canvasToBlob(off);
}

async function downloadExport(sizeName) {
  const status = $('exportStatus');
  try {
    status.textContent = 'Drawing your ' + SIZES[sizeName].label + ' cover…';
    const blob = await exportPNG(sizeName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover-coast-' + sizeName + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    status.textContent = 'Exported ' + SIZES[sizeName].label + ' — ' +
      Math.round(blob.size / 1024) + ' KB PNG. Share it anywhere.';
  } catch (err) {
    status.textContent = 'Export failed: ' + err.message;
  }
}

// ------------------------------------------------------------------ editor input

function bindButtons(rowId, attr, onPick) {
  const row = $(rowId);
  row.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-' + attr + ']');
    if (!btn) return;
    for (const other of row.querySelectorAll('button')) other.classList.remove('active');
    btn.classList.add('active');
    onPick(btn.dataset[attr]);
  });
}

bindButtons('layoutRow', 'layout', (value) => {
  state.layout = value;
  state.selectedPanel = 0;
  renderPreview();
});

bindButtons('gradeRow', 'grade', (value) => {
  state.grade = value;
  renderPreview();
});

bindButtons('sizeRow', 'size', (value) => {
  state.previewSize = value;
  renderPreview();
});

bindButtons('sampleRow', 'photo', (value) => {
  setPanelPhoto(state.selectedPanel, value);
  markActiveThumb();
  renderPreview();
});

bindButtons('exportRow', 'export', (value) => {
  downloadExport(value);
});

$('fillAllBtn').addEventListener('click', () => {
  fillAllPanels(state.panels[state.selectedPanel].photo);
  renderPreview();
});

$('photoUpload').addEventListener('change', async (event) => {
  const files = [...event.target.files].filter((f) => f.type.startsWith('image/'));
  for (const file of files) {
    const id = await addUpload(file);
    setPanelPhoto(state.selectedPanel, id);
  }
  markActiveThumb();
  renderPreview();
  event.target.value = '';
});

$('zoomSlider').addEventListener('input', (event) => {
  state.panels[state.selectedPanel].zoom = Number(event.target.value);
  renderPreview();
});
$('panXSlider').addEventListener('input', (event) => {
  state.panels[state.selectedPanel].ox = Number(event.target.value);
  renderPreview();
});
$('panYSlider').addEventListener('input', (event) => {
  state.panels[state.selectedPanel].oy = Number(event.target.value);
  renderPreview();
});

$('titleInput').addEventListener('input', (event) => {
  state.title = event.target.value;
  renderPreview();
});
$('subtitleInput').addEventListener('input', (event) => {
  state.subtitle = event.target.value;
  renderPreview();
});
$('titleColour').addEventListener('change', (event) => {
  state.titleColour = event.target.value;
  renderPreview();
});
$('subtitleColour').addEventListener('change', (event) => {
  state.subtitleColour = event.target.value;
  renderPreview();
});

// Click a panel to select it; drag it to move the photo inside the panel.
let drag = null;
previewCanvas.addEventListener('pointerdown', (event) => {
  const rect = previewCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (previewCanvas.width / rect.width);
  const y = (event.clientY - rect.top) * (previewCanvas.height / rect.height);
  const rects = previewRects(previewCanvas);
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      state.selectedPanel = i;
      drag = { panel: state.panels[i], startX: x, startY: y, ox: state.panels[i].ox, oy: state.panels[i].oy, w: r.w, h: r.h };
      previewCanvas.setPointerCapture(event.pointerId);
      markActiveThumb();
      renderPreview();
      return;
    }
  }
});

previewCanvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const rect = previewCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (previewCanvas.width / rect.width);
  const y = (event.clientY - rect.top) * (previewCanvas.height / rect.height);
  const panel = drag.panel;
  panel.ox = Math.max(-0.5, Math.min(0.5, drag.ox + (x - drag.startX) / drag.w));
  panel.oy = Math.max(-0.5, Math.min(0.5, drag.oy + (y - drag.startY) / drag.h));
  renderPreview();
});

previewCanvas.addEventListener('pointerup', () => { drag = null; });
previewCanvas.addEventListener('pointercancel', () => { drag = null; });

// ------------------------------------------------------------------ shot mode

const fontsReady = Promise.all([
  document.fonts.load("100px Anton"),
  document.fonts.load("48px Pacifico"),
]).then(() => document.fonts.ready).catch(() => undefined);

function applyShotParams() {
  const params = new URLSearchParams(window.location.search);
  const photo = params.get('photo');
  const caption = params.get('caption');
  const subtitle = params.get('subtitle');
  const layout = params.get('layout');
  const grade = params.get('grade');
  const size = params.get('size');
  if (photo && (SAMPLES[photo] || photos.has(photo))) {
    fillAllPanels(photo);
    state.panels[0].photo = photo;
  }
  if (caption !== null) state.title = caption;
  if (subtitle !== null) state.subtitle = subtitle;
  if (layout && LAYOUTS[layout]) state.layout = layout;
  if (grade && GRADES[grade]) state.grade = grade;
  if (size && SIZES[size]) state.previewSize = size;
}

async function runShotMode(mode) {
  applyShotParams();
  syncControlStates();
  await fontsReady;
  await loadAllStatePhotos();
  if (mode === 'cover') {
    document.body.classList.add('shot-cover');
    previewCanvas.width = window.innerWidth;
    previewCanvas.height = window.innerHeight;
    renderCover(previewCtx, previewCanvas.width, previewCanvas.height, false);
  } else {
    renderPreview();
  }
  window.__shotReady = true;
}

// A small handle for automated checks: export a PNG and inspect the blob,
// or read the current state. Nothing here sends data anywhere.
window.__coverStudio = {
  state,
  exportPNG,
  renderPreview,
};

// ------------------------------------------------------------------ init

async function init() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot === 'cover' || shot === 'editor') {
    await runShotMode(shot);
    return;
  }
  await fontsReady;
  await loadAllStatePhotos();
  syncControlStates();
  renderPreview();
}

init();
