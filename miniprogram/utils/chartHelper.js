const CHART_COLORS = [
  '#C8847A', '#E8A898', '#C9A76B', '#F5C06A',
  '#5BBCAA', '#8FD4D4', '#7BA9D8', '#D4A8D4',
];

/**
 * Draw a donut pie chart.
 * If any segment has a `name` field, leader lines are drawn with "name pct%" labels.
 * Otherwise, percentage labels are drawn inside each slice.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w  logical width  (CSS px, after ctx.scale(dpr,dpr))
 * @param {number} h  logical height
 * @param {Array<{value:number, color:string, name?:string}>} segments
 */
function drawPie(ctx, w, h, segments) {
  const hasNames = segments.some(s => s.name);
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  const cx = w / 2;
  const cy = h / 2;
  // Smaller radius when drawing leader lines to leave room for labels
  const r = hasNames
    ? Math.min(w, h) * 0.27
    : Math.min(w, h) / 2 - 2;

  if (total === 0 || !segments.length) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#F0EDEA';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    return;
  }

  // Draw slices
  let startAngle = -Math.PI / 2;
  segments.forEach(seg => {
    if (!seg.value) return;
    const sliceAngle = (seg.value / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = seg.color || '#CCCCCC';
    ctx.fill();
    startAngle += sliceAngle;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.48, 0, 2 * Math.PI);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  if (hasNames) {
    // Leader lines with "name pct%" labels
    const elbowR = r + 10;
    const extLen  = 13;
    startAngle = -Math.PI / 2;
    segments.forEach(seg => {
      if (!seg.value) return;
      const sliceAngle = (seg.value / total) * 2 * Math.PI;
      const pct = Math.round(seg.value / total * 100);
      const midAngle = startAngle + sliceAngle / 2;
      const cosM = Math.cos(midAngle);
      const sinM = Math.sin(midAngle);
      const isRight = cosM >= 0;

      const edgeX  = cx + cosM * r;
      const edgeY  = cy + sinM * r;
      const elbowX = cx + cosM * elbowR;
      const elbowY = cy + sinM * elbowR;
      const textX  = elbowX + (isRight ? extLen : -extLen);

      // Leader line: edge → elbow → horizontal end
      ctx.beginPath();
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = 1;
      ctx.moveTo(edgeX, edgeY);
      ctx.lineTo(elbowX, elbowY);
      ctx.lineTo(textX, elbowY);
      ctx.stroke();

      // Small dot at elbow
      ctx.beginPath();
      ctx.arc(elbowX, elbowY, 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = seg.color;
      ctx.fill();

      // Label: first 2 chars of name + " pct%"
      const nameShort = seg.name ? seg.name.slice(0, 2) : '';
      const label = `${nameShort} ${pct}%`;
      ctx.fillStyle = '#333333';
      ctx.font = '8px sans-serif';
      ctx.textAlign = isRight ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, textX + (isRight ? 3 : -3), elbowY);

      startAngle += sliceAngle;
    });
    ctx.textBaseline = 'alphabetic';

  } else {
    // Internal percentage labels (skip slices < 8%)
    startAngle = -Math.PI / 2;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    segments.forEach(seg => {
      if (!seg.value) return;
      const sliceAngle = (seg.value / total) * 2 * Math.PI;
      const pct = Math.round(seg.value / total * 100);
      if (pct >= 8) {
        const midAngle = startAngle + sliceAngle / 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(pct + '%',
          cx + Math.cos(midAngle) * r * 0.73,
          cy + Math.sin(midAngle) * r * 0.73);
      }
      startAngle += sliceAngle;
    });
    ctx.textBaseline = 'alphabetic';
  }
}

/**
 * Draw a single line / area chart with Y-axis labels.
 * Returns computed point positions for touch hit-testing.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {Array<{value:number, label:string}>} points  label = 'YYYY-MM-DD'
 * @param {string} color
 * @param {{x,y,value,label}|null} highlight  touch highlight point
 * @returns {Array<{x,y,value,label}>}
 */
function drawLine(ctx, w, h, points, color, highlight) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, w, h);

  if (!points || points.length < 2) {
    ctx.fillStyle = '#CCCCCC';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', w / 2, h / 2);
    ctx.textBaseline = 'alphabetic';
    return [];
  }

  const padL = 40, padR = 8, padT = 12, padB = 20;
  const cW = w - padL - padR;
  const cH = h - padT - padB;
  const n = points.length;
  const maxVal = Math.max(...points.map(p => p.value), 1);

  // Y-axis labels
  ctx.fillStyle = '#BBBBBB';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(yLabel(maxVal),                 padL - 4, padT);
  ctx.fillText(yLabel(Math.round(maxVal / 2)), padL - 4, padT + cH / 2);
  ctx.textBaseline = 'alphabetic';

  // Grid lines
  ctx.strokeStyle = '#EEEEEE';
  ctx.lineWidth = 0.5;
  [0.25, 0.5, 0.75, 1].forEach(frac => {
    const y = padT + cH * (1 - frac);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + cW, y);
    ctx.stroke();
  });

  const pts = points.map((p, i) => ({
    x:     padL + (n > 1 ? (i / (n - 1)) * cW : cW / 2),
    y:     padT + cH * (1 - p.value / maxVal),
    value: p.value,
    label: (p.label || '').slice(5),
  }));

  // Area fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
  grad.addColorStop(0, hexAlpha(color, 0.35));
  grad.addColorStop(1, hexAlpha(color, 0.02));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, padT + cH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[n - 1].x, padT + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  // Dots
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // X-axis labels
  ctx.fillStyle = '#BBBBBB';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(pts[0].label, pts[0].x, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(pts[n - 1].label, pts[n - 1].x, h - 4);

  // Touch highlight overlay
  if (highlight) {
    const p = highlight;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.strokeStyle = '#AAAAAA';
    ctx.lineWidth = 1;
    ctx.moveTo(p.x, padT);
    ctx.lineTo(p.x, padT + cH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    const tipText = String(p.value);
    ctx.font = 'bold 11px sans-serif';
    const tipW = ctx.measureText(tipText).width + 14;
    const tipH = 20;
    let tx = p.x - tipW / 2;
    tx = Math.max(padL, Math.min(tx, w - padR - tipW));
    let ty = p.y - tipH - 8;
    if (ty < padT) ty = p.y + 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.rect(tx, ty, tipW, tipH);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tipText, tx + tipW / 2, ty + tipH / 2);

    ctx.fillStyle = color;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(p.label, p.x, h - 4);
  }

  return pts;
}

/**
 * Draw multiple line series on a shared Y axis with touch highlights.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {Array<{name:string, color:string, points:Array<{value:number,label:string}>}>} series
 * @param {Array<{x,y,value,label}|null>|null} highlights  one entry per series (or null)
 * @returns {Array<Array<{x,y,value,label}>>}  pts per series
 */
function drawMultiLine(ctx, w, h, series, highlights) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, w, h);

  const firstPts = series && series[0] && series[0].points;
  if (!firstPts || firstPts.length < 2) {
    ctx.fillStyle = '#CCCCCC';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('暂无数据', w / 2, h / 2);
    ctx.textBaseline = 'alphabetic';
    return (series || []).map(() => []);
  }

  const padL = 40, padR = 8, padT = 12, padB = 20;
  const cW = w - padL - padR;
  const cH = h - padT - padB;
  const n = firstPts.length;

  const maxVal = Math.max(...series.flatMap(s => s.points.map(p => p.value)), 1);

  // Y-axis labels
  ctx.fillStyle = '#BBBBBB';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(yLabel(maxVal),                 padL - 4, padT);
  ctx.fillText(yLabel(Math.round(maxVal / 2)), padL - 4, padT + cH / 2);
  ctx.textBaseline = 'alphabetic';

  // Grid lines
  ctx.strokeStyle = '#EEEEEE';
  ctx.lineWidth = 0.5;
  [0.25, 0.5, 0.75, 1].forEach(frac => {
    const y = padT + cH * (1 - frac);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + cW, y);
    ctx.stroke();
  });

  // Compute pts for each series
  const allPts = series.map(s => s.points.map((p, i) => ({
    x:     padL + (n > 1 ? (i / (n - 1)) * cW : cW / 2),
    y:     padT + cH * (1 - p.value / maxVal),
    value: p.value,
    label: (p.label || '').slice(5),
  })));

  // Area fills (subtle, rendered back to front)
  series.forEach((s, si) => {
    const pts = allPts[si];
    const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
    grad.addColorStop(0, hexAlpha(s.color, 0.15));
    grad.addColorStop(1, hexAlpha(s.color, 0.01));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, padT + cH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[n - 1].x, padT + cH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  });

  // Lines and dots
  series.forEach((s, si) => {
    const pts = allPts[si];
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  });

  // X-axis labels
  const refPts = allPts[0];
  ctx.fillStyle = '#BBBBBB';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(refPts[0].label, refPts[0].x, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(refPts[n - 1].label, refPts[n - 1].x, h - 4);

  // Highlights
  if (highlights) {
    const hl0 = highlights[0];
    if (hl0) {
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.strokeStyle = '#CCCCCC';
      ctx.lineWidth = 1;
      ctx.moveTo(hl0.x, padT);
      ctx.lineTo(hl0.x, padT + cH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Enlarged dots per series
    series.forEach((s, si) => {
      const hl = highlights[si];
      if (!hl) return;
      ctx.beginPath();
      ctx.arc(hl.x, hl.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Composite tooltip
    if (hl0) {
      ctx.font = '10px sans-serif';
      const lines = series.map((s, si) => `${s.name}: ${highlights[si] ? highlights[si].value : '-'}`);
      const maxTW = Math.max(...lines.map(l => ctx.measureText(l).width));
      const tipW = maxTW + 16;
      const tipH = lines.length * 16 + 8;
      let tx = hl0.x - tipW / 2;
      tx = Math.max(padL, Math.min(tx, w - padR - tipW));
      let ty = hl0.y - tipH - 10;
      if (ty < padT) ty = hl0.y + 10;

      ctx.fillStyle = 'rgba(44,44,44,0.88)';
      ctx.beginPath();
      ctx.rect(tx, ty, tipW, tipH);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillStyle = series[i].color;
        ctx.fillText(line, tx + 8, ty + 4 + i * 16);
      });
      ctx.textBaseline = 'alphabetic';

      // Date label
      ctx.fillStyle = '#888888';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hl0.label, hl0.x, h - 4);
    }
  }

  return allPts;
}

function yLabel(val) {
  if (val >= 10000) return (val / 10000).toFixed(1) + 'w';
  if (val >= 1000)  return (val / 1000).toFixed(1) + 'k';
  return String(val);
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

module.exports = { drawPie, drawLine, drawMultiLine, CHART_COLORS };
