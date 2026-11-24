// Each recorded sample contains physical time (s), ahead thrust (N), drive torque (N·m) and unwrapped shaft turns.
export function installShaftLoads(panel, solutions, scaleCases) {
  const colors = {'modelica-mesh': '#72d3c3', rumoca: '#72d3c3', openfoam: '#efac6f'};
  const series = solutions.map(({solver, m, loads}) => {
    const scale = m.rho_kg_m3 * (m.rpm / 60) ** 2 * m.diameter_m ** 4;
    return {name: m.mesher ?? (solutions.some(d=>d.m.mesher) ? 'snappyHexMesh' : m.solver), color: colors[solver], loads,
      steady: !m.sequence, mean: [0, m.kt * scale, m.kq * scale * m.diameter_m]};
  });
  const body = panel.querySelector('.pane-body');
  const recorded = series.filter(s => s.loads);
  const start = recorded.length ? Math.max(...recorded.map(s => s.loads[0])) : 0;
  const end = recorded.length ? Math.min(...recorded.map(s => s.loads.at(-4))) : 0;
  const legend = document.createElement('div');
  legend.className = 'shaft-legend';
  for (const s of series) {
    const label = document.createElement('span');
    label.style.color = s.color;
    label.textContent = s.name + (s.steady ? ' (steady mean)' : '');
    legend.append(label);
  }
  body.append(legend);

  function sample(s, time, field) {
    if (!s.loads) return s.steady ? s.mean[field] : NaN;
    let lo = 0, hi = s.loads.length / 4 - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (time > (s.loads[4*mid] + s.loads[4*mid+4])/2) lo = mid + 1;
      else hi = mid;
    }
    return s.loads[4*lo + field];
  }
  let playbackTime = start, hoverTime;
  const clock = document.createElement('div');
  clock.className = 'shaft-time';
  const plots = [];
  let lastDrawn;
  function update(time) {
    playbackTime = time ?? start;
    const t = Math.min(end, Math.max(start, hoverTime ?? playbackTime));
    if (!panel.open || t === lastDrawn) return;
    lastDrawn = t;
    clock.textContent = end > start ? t.toFixed(3) + ' s' : '';
    for (const {field, cursor, output} of plots) {
      if (cursor) {
        const x = 38 + 250*(t-start)/(end-start);
        cursor.setAttribute('x1', x);
        cursor.setAttribute('x2', x);
      }
      output.textContent = series.map(s => {
        const v = sample(s, t, field);
        return s.name + ' ' + (Number.isFinite(v) ? v.toFixed(field === 1 ? 2 : 4) : '—');
      }).join('  ·  ');
    }
  }
  for (const [field, name] of [[1,'Thrust (N)'], [2,'Shaft torque (N·m)']]) {
    const title = document.createElement('strong');
    title.textContent = name;
    body.append(title);
    let cursor;
    if (end > start) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 294 96');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', name + ' versus solver time in seconds');
      function draw(tag, attributes, text) {
        const e = document.createElementNS(svg.namespaceURI, tag);
        for (const [k,v] of Object.entries(attributes)) e.setAttribute(k, v);
        if (text !== undefined) e.textContent = text;
        svg.append(e);
        return e;
      }
      let min = 0, max = 0;
      for (const m of scaleCases) {
        const scale=m.rho_kg_m3*(m.rpm/60)**2*m.diameter_m**4;
        const mean=field===1?m.kt*scale:m.kq*scale*m.diameter_m;
        const bounds=m.shaftLoadBounds?.[field-1] ?? [mean,mean];
        min=Math.min(min,bounds[0]); max=Math.max(max,bounds[1]);
      }
      const x = t => 38 + 250*(t-start)/(end-start);
      const y = v => 73 - 65*(v-min)/(max-min || 1);
      for (const v of new Set([min, max])) {
        draw('line', {x1:38, x2:288, y1:y(v), y2:y(v), stroke:'#395762'});
        draw('text', {x:34, y:y(v)+3, 'text-anchor':'end'}, Number(v.toPrecision(2)));
      }
      draw('text', {x:38, y:90}, start.toFixed(3)+' s');
      draw('text', {x:288, y:90, 'text-anchor':'end'}, end.toFixed(3)+' s');
      for (const s of series) {
        if (!s.loads && !s.steady) continue;
        const points = [];
        if (s.loads) for (let i = 0; i < s.loads.length; i += 4) {
          points.push(x(s.loads[i]).toFixed(2)+','+y(s.loads[i+field]).toFixed(2));
        } else points.push('38,'+y(s.mean[field]), '288,'+y(s.mean[field]));
        draw('polyline', {points:points.join(' '), fill:'none', stroke:s.color,
          'stroke-width':1.4, 'stroke-dasharray':s.steady?'4 3':'none'});
      }
      cursor = draw('line', {y1:5, y2:75, stroke:'#fff'});
      svg.onpointermove = e => {
        const point = new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
        hoverTime = start + (end-start)*(point.x-38)/250;
        update(playbackTime);
      };
      svg.onpointerleave = () => { hoverTime = undefined; update(playbackTime); };
      body.append(svg);
    }
    const output = document.createElement('div');
    output.className = 'shaft-values';
    body.append(output);
    plots.push({field, cursor, output});
  }
  body.append(clock);
  panel.addEventListener('toggle', () => { hoverTime = undefined; lastDrawn = undefined; update(playbackTime); });
  update(start);
  return update;
}
