/*
 * The Shot Card: the captured frame + the shot name + the full lighting
 * setup — a top-down plan of where the lights sit and a per-light
 * breakdown of position, temperature, and intensity. The takeaway you
 * screenshot after playing with the light.
 */

const W = 1080;
const H = 1350;    // 4:5 portrait — fits the image + the setup sheet
const PAD = 44;
const IMG_H = 560; // 16:9-ish frame region

export async function makeShotCard({ frameCanvas, recipe, siteName }) {
  try { await document.fonts.ready; } catch { /* fonts optional */ }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  x.fillStyle = '#0a0705';
  x.fillRect(0, 0, W, H);

  // ——— the frame: cover-fit the render into the image region ———
  const iw = W - PAD * 2;
  const ih = IMG_H;
  const dr = iw / ih;
  const sr = frameCanvas.width / frameCanvas.height;
  let sw, sh, sx, sy;
  if (sr > dr) { sh = frameCanvas.height; sw = sh * dr; sx = (frameCanvas.width - sw) / 2; sy = 0; }
  else { sw = frameCanvas.width; sh = sw / dr; sx = 0; sy = (frameCanvas.height - sh) / 2; }
  x.drawImage(frameCanvas, sx, sy, sw, sh, PAD, PAD, iw, ih);
  x.strokeStyle = 'rgba(224,169,110,0.5)';
  x.lineWidth = 1;
  x.strokeRect(PAD - 8.5, PAD - 8.5, iw + 17, ih + 17);

  // ——— header row ———
  let y = PAD + IMG_H + 58;
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#e0a96e';
  x.font = '500 20px "IBM Plex Mono", monospace';
  spaced(x, 'SHOT CARD', PAD, y, 6);
  x.fillStyle = 'rgba(239,231,220,0.4)';
  x.font = '300 18px "IBM Plex Mono", monospace';
  spacedRight(x, (siteName || 'OBSERVATORY').toUpperCase(), W - PAD, y, 5);

  // ——— the pattern name, big serif ———
  y += 70;
  x.fillStyle = '#efe7dc';
  x.font = '300 66px "Cormorant Garamond", Georgia, serif';
  x.fillText(recipe.pattern, PAD - 2, y);

  // ——— recipe line ———
  y += 46;
  x.fillStyle = '#f5c542';
  x.font = '400 21px "IBM Plex Mono", monospace';
  spaced(x, recipe.line.toUpperCase(), PAD, y, 2.5);

  // ——— divider ———
  y += 34;
  x.strokeStyle = 'rgba(224,169,110,0.18)';
  x.beginPath(); x.moveTo(PAD, y); x.lineTo(W - PAD, y); x.stroke();

  // ——— the setup: plan diagram (left) + light breakdown (right) ———
  const L = recipe.lights;
  if (L) {
    const blockY = y + 30;
    const planSize = 260;
    drawPlan(x, PAD + planSize / 2, blockY + planSize / 2, planSize, L);

    const rx = PAD + planSize + 48;
    let ry = blockY + 26;
    x.fillStyle = 'rgba(224,169,110,0.75)';
    x.font = '500 13px "IBM Plex Mono", monospace';
    spaced(x, 'THE SETUP', rx, ry, 3);
    ry += 40;

    lightRow(x, rx, ry, 'KEY', '#f5c542',
      L.key.on && L.key.power > 0.02
        ? `${L.key.az}° orbit · ${L.key.el}° high`
        : 'off',
      L.key.on && L.key.power > 0.02 ? `${L.key.k | 0}K   ×${L.key.power.toFixed(2)}` : '');
    ry += 62;
    lightRow(x, rx, ry, 'FILL', '#e0a96e',
      L.fill.on && L.fill.power > 0.02 ? 'camera side' : 'off',
      L.fill.on && L.fill.power > 0.02 ? `${L.fill.k | 0}K   ×${L.fill.power.toFixed(2)}` : '');
    ry += 62;
    lightRow(x, rx, ry, 'RIM', '#efe7dc',
      L.rim.on && L.rim.power > 0.02 ? 'behind subject' : 'off',
      L.rim.on && L.rim.power > 0.02 ? `×${L.rim.power.toFixed(2)}` : '');
    ry += 62;
    lightRow(x, rx, ry, 'LENS', 'rgba(224,169,110,0.7)',
      `${L.mm | 0}mm · ${L.angle}`, '');

    y = blockY + planSize + 4;
  }

  // ——— teaching note ———
  y += 48;
  x.fillStyle = 'rgba(239,231,220,0.5)';
  x.font = 'italic 300 25px "Cormorant Garamond", Georgia, serif';
  wrap(x, recipe.note, PAD, y, W - PAD * 2, 31);

  return c;
}

/* top-down lighting plan — where the lights sit around the subject */
function drawPlan(x, cx, cy, size, L) {
  const R = size / 2;
  const D2R = Math.PI / 180;
  const pos = (az, r) => [cx + Math.sin(az) * R * r, cy + Math.cos(az) * R * r];

  x.strokeStyle = 'rgba(224,169,110,0.28)';
  x.lineWidth = 1.5;
  x.beginPath(); x.arc(cx, cy, R * 0.84, 0, Math.PI * 2); x.stroke();

  // subject + facing tick (faces "down" toward the default camera)
  x.fillStyle = '#efe7dc';
  x.beginPath(); x.arc(cx, cy, 6, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(239,231,220,0.5)';
  x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy + 18); x.stroke();

  // camera wedge
  const [camX, camY] = pos(L.camAz, 0.92);
  x.save();
  x.translate(camX, camY); x.rotate(-L.camAz);
  x.fillStyle = '#e0a96e';
  x.beginPath(); x.moveTo(0, -9); x.lineTo(8, 7); x.lineTo(-8, 7); x.closePath(); x.fill();
  x.restore();

  const dots = [
    ['K', L.key.az * D2R, L.key.on && L.key.power > 0.02, '#f5c542'],
    ['F', L.fill.az, L.fill.on && L.fill.power > 0.02, '#e0a96e'],
    ['R', L.rim.az, L.rim.on && L.rim.power > 0.02, '#efe7dc'],
  ];
  x.font = '600 15px "IBM Plex Mono", monospace';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const [ch, az, on, col] of dots) {
    const [dx, dy] = pos(az, 0.62);
    x.fillStyle = on ? col : 'rgba(120,105,90,0.4)';
    x.beginPath(); x.arc(dx, dy, 13, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(10,7,5,0.9)';
    x.fillText(ch, dx, dy);
  }
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
}

/* one line of the breakdown: swatch + label + position + values */
function lightRow(x, px, py, label, color, position, values) {
  x.fillStyle = color;
  x.beginPath(); x.arc(px + 5, py - 5, 5, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#efe7dc';
  x.font = '500 17px "IBM Plex Mono", monospace';
  spaced(x, label, px + 20, py, 2);
  x.fillStyle = 'rgba(239,231,220,0.55)';
  x.font = '300 17px "Cormorant Garamond", Georgia, serif';
  x.fillText(position, px + 20, py + 24);
  if (values) {
    x.fillStyle = 'rgba(245,197,66,0.85)';
    x.font = '400 15px "IBM Plex Mono", monospace';
    spacedRight(x, values, W - PAD, py + 22, 1);
  }
}

export async function shareOrDownload(canvas, filename) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return false;
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Shot Card' });
      return true;
    } catch {
      /* user cancelled → fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

function spaced(x, text, px, py, tracking) {
  let cx = px;
  for (const ch of text) {
    x.fillText(ch, cx, py);
    cx += x.measureText(ch).width + tracking;
  }
}

function spacedRight(x, text, right, py, tracking) {
  let w = 0;
  for (const ch of text) w += x.measureText(ch).width + tracking;
  spaced(x, text, right - w, py, tracking);
}

function wrap(x, text, px, py, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let y = py;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (x.measureText(test).width > maxW && line) {
      x.fillText(line, px, y);
      line = w;
      y += lineH;
    } else line = test;
  }
  if (line) x.fillText(line, px, y);
}
