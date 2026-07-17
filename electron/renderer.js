const { createCanvas } = require('@napi-rs/canvas');

function createRenderer(flightLog, config) {
  const { width, height, curves } = config;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const bgColor = config.bgColor || null;
  const active = curves || [];
  const gridRows = Math.max(active.length, 1);
  const rowH = height / gridRows;
  const windowUs = 500000; // 500ms visible window

  // Pre-compute field indices
  for (const c of active) {
    c._fi = flightLog.getMainFieldIndexByName(c.fieldName);
  }

  function render(windowCenterTime) {
    // Background
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridRows; i++) {
      const y = i * rowH;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const t0 = windowCenterTime - windowUs / 2;
    const t1 = windowCenterTime + windowUs / 2;

    for (let ci = 0; ci < active.length; ci++) {
      const c = active[ci];
      if (c._fi === undefined) continue;

      const yTop = ci * rowH;
      const yBtm = yTop + rowH;

      // Fetch data and compute window min/max
      const chunks = flightLog.getChunksInTimeRange(t0, t1);
      const pts = [];
      let wMin = Infinity, wMax = -Infinity;
      for (const ch of chunks) {
        const frames = ch.frames || ch;
        for (const f of frames) {
          const t = f[1], v = f[c._fi];
          if (v != null && !isNaN(v)) {
            pts.push({ t, v });
            if (v < wMin) wMin = v;
            if (v > wMax) wMax = v;
          }
        }
      }

      if (pts.length < 2 || wMin >= wMax) {
        wMin = wMin === Infinity ? -100 : wMin - 1;
        wMax = wMax === -Infinity ? 100 : wMax + 1;
      }
      const yR = wMax - wMin || 1;

      // Label
      ctx.fillStyle = c.color || '#0f0';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(c.fieldName || '', 4, yTop + 14);

      // Value labels at min/max
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'right';
      ctx.fillText(wMax.toFixed(0), width - 4, yTop + 14);
      ctx.fillText(wMin.toFixed(0), width - 4, yBtm - 2);

      // Draw curve
      ctx.strokeStyle = c.color || '#0f0';
      ctx.lineWidth = Math.max(c.width || 1.5, 1.5);
      ctx.beginPath();
      let first = true;
      for (const p of pts) {
        const x = ((p.t - t0) / windowUs) * width;
        const y = yBtm - ((p.v - wMin) / yR) * rowH;
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    return ctx.getImageData(0, 0, width, height).data;
  }

  return { render, width, height };
}

module.exports = { createRenderer };
