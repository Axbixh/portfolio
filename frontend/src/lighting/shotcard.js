/*
 * The Shot Card (spec §4): capture the frame + the recipe as a shareable
 * PNG. "Low-key. Rembrandt key, 4:1, 85mm, slight low angle."
 */

const W = 1080;
const IMG_H = 810; // 4:3 frame region
const H = 1080;    // square card, share-friendly

export async function makeShotCard({ frameCanvas, recipe, siteName }) {
  try { await document.fonts.ready; } catch { /* fonts optional */ }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  // card ground
  x.fillStyle = '#0a0705';
  x.fillRect(0, 0, W, H);

  // frame: cover-fit the render into the image region
  const pad = 40;
  const iw = W - pad * 2;
  const ih = IMG_H - pad;
  const sr = frameCanvas.width / frameCanvas.height;
  const dr = iw / ih;
  let sw, sh, sx, sy;
  if (sr > dr) {
    sh = frameCanvas.height;
    sw = sh * dr;
    sx = (frameCanvas.width - sw) / 2;
    sy = 0;
  } else {
    sw = frameCanvas.width;
    sh = sw / dr;
    sx = 0;
    sy = (frameCanvas.height - sh) / 2;
  }
  x.drawImage(frameCanvas, sx, sy, sw, sh, pad, pad, iw, ih);

  // hairline frame around the image
  x.strokeStyle = 'rgba(224,169,110,0.5)';
  x.lineWidth = 1;
  x.strokeRect(pad - 8.5, pad - 8.5, iw + 17, ih + 17);

  // header row
  x.fillStyle = '#e0a96e';
  x.font = '500 20px "IBM Plex Mono", monospace';
  x.textBaseline = 'alphabetic';
  spaced(x, 'SHOT CARD', pad, IMG_H + 76, 6);

  x.fillStyle = 'rgba(239,231,220,0.4)';
  x.font = '300 18px "IBM Plex Mono", monospace';
  const tag = (siteName || 'OBSERVATORY').toUpperCase();
  spacedRight(x, tag, W - pad, IMG_H + 76, 5);

  // the pattern, big and serif
  x.fillStyle = '#efe7dc';
  x.font = '300 68px "Cormorant Garamond", Georgia, serif';
  x.fillText(recipe.pattern, pad - 2, IMG_H + 160);

  // recipe line
  x.fillStyle = '#f5c542';
  x.font = '400 22px "IBM Plex Mono", monospace';
  spaced(x, recipe.line.toUpperCase(), pad, IMG_H + 210, 3);

  // teaching note
  x.fillStyle = 'rgba(239,231,220,0.55)';
  x.font = 'italic 300 26px "Cormorant Garamond", Georgia, serif';
  wrap(x, recipe.note, pad, IMG_H + 252, W - pad * 2, 32);

  return c;
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
