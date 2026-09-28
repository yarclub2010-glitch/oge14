// Круговая диаграмма в SVG — для практикума и для предпросмотра диаграммы из файла.

const PALETTE = ['#2f6fdf', '#f08a24', '#2f9e44', '#d6336c', '#7048e8', '#0c8599', '#e8590c', '#5c940d'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100).replace('.', ','));

// items: [{ label, value }], opts: { legend: bool, labels: 'value' | 'percent' | 'none' }
export function pieSVG(items, opts = {}) {
  const W = 360;
  const H = 220;
  const cx = 110;
  const cy = 110;
  const R = 92;
  const total = items.reduce((s, it) => s + Math.max(0, it.value), 0);
  let out = `<svg viewBox="0 0 ${W} ${H}" class="pie" role="img" aria-label="Круговая диаграмма">`;
  if (!(total > 0)) {
    return out + `<circle cx="${cx}" cy="${cy}" r="${R}" class="pie-empty"/><text x="${cx}" y="${cy}" text-anchor="middle" class="pie-note">нет данных</text></svg>`;
  }
  let a = -Math.PI / 2;
  const labels = [];
  items.forEach((it, i) => {
    const v = Math.max(0, it.value);
    const da = (v / total) * 2 * Math.PI;
    const color = PALETTE[i % PALETTE.length];
    if (da >= 2 * Math.PI - 1e-9) {
      out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${color}" stroke="var(--panel)" stroke-width="2"/>`;
    } else if (da > 0) {
      const x1 = cx + R * Math.cos(a);
      const y1 = cy + R * Math.sin(a);
      const x2 = cx + R * Math.cos(a + da);
      const y2 = cy + R * Math.sin(a + da);
      out += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${da > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" stroke="var(--panel)" stroke-width="2"/>`;
    }
    if (opts.labels && opts.labels !== 'none' && v > 0) {
      const mid = a + da / 2;
      const text = opts.labels === 'percent' ? `${fmt(Math.round((v / total) * 1000) / 10)}%` : fmt(it.value);
      labels.push(`<text x="${(cx + R * 0.62 * Math.cos(mid)).toFixed(1)}" y="${(cy + R * 0.62 * Math.sin(mid)).toFixed(1)}" text-anchor="middle" dominant-baseline="central" class="pie-label">${esc(text)}</text>`);
    }
    a += da;
  });
  out += labels.join('');
  if (opts.legend) {
    const x = 230;
    let y = cy - (items.length * 22) / 2 + 11;
    items.forEach((it, i) => {
      out += `<rect x="${x}" y="${y - 6}" width="12" height="12" rx="2" fill="${PALETTE[i % PALETTE.length]}"/><text x="${x + 18}" y="${y}" dominant-baseline="central" class="pie-legend">${esc(it.label === '' ? String(i + 1) : it.label)}</text>`;
      y += 22;
    });
  }
  return out + '</svg>';
}
