/* Bladr core: geometri for markeringer + PDF-eksport. Koordinater er "visningsrum": pt ved zoom 1, origo øverst til venstre, siden som den vises uden ekstra rotation. */
var BladrCore = (function(){
const K = 0.5523, PAD = 4;
let measureFn = (s, size, bold) => s.length * size * (bold ? 0.6 : 0.52);
function setMeasure(fn){ measureFn = fn; }

const PT_MM = 25.4 / 72;
function fmtLen(pt, ctx){
  const c = ctx||{}, d = c.dec && c.dec!=='auto' ? +c.dec : null;
  const f = (v,p) => v.toLocaleString('da-DK',{minimumFractionDigits:p,maximumFractionDigits:p});
  if(!c.scale){ const pu = c.paperUnit==='cm' ? 'cm' : 'mm', v = pt*PT_MM/(pu==='cm'?10:1);
    return f(v, d ?? (pu==='cm'?1:0)) + ' ' + pu + ' (papir)'; }
  const m = pt*c.scale, u = c.unit||'m';
  if(u==='mm') return f(m*1000, d ?? 0) + ' mm';
  if(u==='cm') return f(m*100, d ?? 1) + ' cm';
  return f(m, d ?? 2) + ' m';
}

function dashFor(a){ const w = a.width||1;
  if(a.dash === 'dash') return {arr:[4*w+2, 2*w+2], cap:0};
  if(a.dash === 'dot') return {arr:[0.01, 2*w+1.5], cap:1};
  return {arr:null, cap:0};
}
function arrowLen(w){ return 5 + 3*w; }
function arrowHead(sx, sy, tx, ty, w){
  const L = arrowLen(w), d = Math.hypot(tx-sx, ty-sy) || 1, ux = (tx-sx)/d, uy = (ty-sy)/d, hw = L*0.38;
  const bx = tx - ux*L, by = ty - uy*L;
  return [['M',tx,ty],['L',bx - uy*hw, by + ux*hw],['L',bx + uy*hw, by - ux*hw],['Z']];
}
/* Sky langs en lukket polygon: buerne vender altid udad, uanset tegneretning */
function cloudPoly(pts, width){
  const d = 10 + 2*width, n0 = pts.length, ops = [['M',pts[0][0],pts[0][1]]];
  let sa = 0; for(let i=0;i<n0;i++){ const a=pts[i], b=pts[(i+1)%n0]; sa += a[0]*b[1]-b[0]*a[1]; }
  const sg = sa >= 0 ? 1 : -1;
  for(let e=0;e<n0;e++){
    const [ax,ay] = pts[e], [bx,by] = pts[(e+1)%n0];
    const len = Math.hypot(bx-ax, by-ay); if(len < 0.5) continue;
    const n = Math.max(1, Math.round(len/d)), ux = (bx-ax)/len, uy = (by-ay)/len, nx = uy*sg, ny = -ux*sg, seg = len/n, r = seg/2;
    for(let i=0;i<n;i++){
      const px = ax+ux*seg*i, py = ay+uy*seg*i, qx = px+ux*seg, qy = py+uy*seg, tx = px+ux*r+nx*r, ty = py+uy*r+ny*r;
      ops.push(['C', px+nx*r*K, py+ny*r*K, tx-ux*r*K, ty-uy*r*K, tx, ty]);
      ops.push(['C', tx+ux*r*K, ty+uy*r*K, qx+nx*r*K, qy+ny*r*K, qx, qy]);
    }
  }
  ops.push(['Z']); return ops;
}
function cloudOps(x, y, w, h, width){ return cloudPoly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]], width); }
const pairs = p => { const r=[]; for(let i=0;i<p.length;i+=2) r.push([p[i],p[i+1]]); return r; };
function rectOps(x,y,w,h){ return [['M',x,y],['L',x+w,y],['L',x+w,y+h],['L',x,y+h],['Z']]; }
function circleOps(cx,cy,r){ const k=r*K; return [['M',cx+r,cy],['C',cx+r,cy+k,cx+k,cy+r,cx,cy+r],['C',cx-k,cy+r,cx-r,cy+k,cx-r,cy],['C',cx-r,cy-k,cx-k,cy-r,cx,cy-r],['C',cx+k,cy-r,cx+r,cy-k,cx+r,cy],['Z']]; }
function cloudCircleOps(cx,cy,r,width){
  const d=10+2*width, n=Math.max(8,Math.round(2*Math.PI*r/d)), ops=[['M',cx+r,cy]];
  for(let i=0;i<n;i++){
    const a0=i*2*Math.PI/n, a1=(i+1)*2*Math.PI/n, am=(a0+a1)/2;
    const p0=[cx+r*Math.cos(a0),cy+r*Math.sin(a0)], p1=[cx+r*Math.cos(a1),cy+r*Math.sin(a1)];
    const c=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]), h=(4/3)*(c/2), nx=Math.cos(am), ny=Math.sin(am);
    ops.push(['C',p0[0]+nx*h,p0[1]+ny*h,p1[0]+nx*h,p1[1]+ny*h,p1[0],p1[1]]);
  }
  ops.push(['Z']); return ops;
}
/* Måltekst: centreret i (x,y), drejet rot (radianer, y nedad), med hvid baggrund */
function labelPrims(out, l, color){
  const c = Math.cos(l.rot||0), s = Math.sin(l.rot||0), R = (px,py) => [l.x+px*c-py*s, l.y+px*s+py*c];
  const hw = l.w/2, hh = l.h/2, p = [R(-hw,-hh),R(hw,-hh),R(hw,hh),R(-hw,hh)];
  if(l.bg !== false) out.push({k:'path', ops:[['M',...p[0]],['L',...p[1]],['L',...p[2]],['L',...p[3]],['Z']], stroke:null, fill:'#ffffff'});
  const lines = String(l.str).split('\n'), top = -hh + l.size*0.2;
  lines.forEach((ln,i) => { const lw = measureFn(ln, l.size), t = R(-lw/2, top + l.size*0.85 + i*l.size*1.25);
    out.push({k:'text', x:t[0], y:t[1], str:ln, size:l.size, color, rot:l.rot||0}); });
}
function normRot(t){ while(t > Math.PI/2+1e-9) t -= Math.PI; while(t <= -Math.PI/2+1e-9) t += Math.PI; return t; }
/* Målenes standardplacering: ved siden af og langs med figuren. a.lo / a.lo2 er brugerens forskydning. */
function dimLabels(a, ctx){
  const s = a.size||10, w = a.width||1, L = [], F = pt => fmtLen(pt, ctx), off = o => o||{x:0,y:0};
  if(a.type==='measure' || (a.type==='line' && a.showDim)){
    const dx = a.x2-a.x1, dy = a.y2-a.y1, d = Math.hypot(dx,dy)||1, rot = normRot(Math.atan2(dy,dx));
    const nx = Math.sin(rot), ny = -Math.cos(rot), g = s*0.65 + w/2 + 3 + (a.type==='line' && (a.arrowEnd||a.arrowStart) ? 2 : 0);
    const str = a.type==='measure' ? ((a.label && a.label.trim()) || F(d)) : F(d), o = off(a.lo);
    L.push({key:'lo', str, x:(a.x1+a.x2)/2 + nx*g + o.x, y:(a.y1+a.y2)/2 + ny*g + o.y, rot, size:s});
  } else if(a.type==='rect' && a.showDim){
    const g = s*0.65 + w/2 + 3 + (a.dash==='cloud' ? (10+2*w)/2 : 0), o = off(a.lo), o2 = off(a.lo2);
    L.push({key:'lo', str:F(a.w), x:a.x+a.w/2+o.x, y:a.y-g+o.y, rot:0, size:s});
    L.push({key:'lo2', str:F(a.h), x:a.x+a.w+g+o2.x, y:a.y+a.h/2+o2.y, rot:-Math.PI/2, size:s});
  } else if(a.type==='poly' && a.pts && a.pts.length >= 4){
    const p = a.pts, n = p.length/2;
    if(a.showDim) for(let i=1;i<n;i++){
      const x1=p[2*i-2], y1=p[2*i-1], x2=p[2*i], y2=p[2*i+1], d=Math.hypot(x2-x1,y2-y1); if(d < 1) continue;
      const rot = normRot(Math.atan2(y2-y1,x2-x1)), g = s*0.65 + w/2 + 3, o = off(a['ls'+i]);
      L.push({key:'ls'+i, str:F(d), x:(x1+x2)/2+Math.sin(rot)*g+o.x, y:(y1+y2)/2-Math.cos(rot)*g+o.y, rot, size:s});
    }
    const x1=p[2*n-4], y1=p[2*n-3], x2=p[2*n-2], y2=p[2*n-1], d=Math.hypot(x2-x1,y2-y1)||1, ux=(x2-x1)/d, uy=(y2-y1)/d;
    const str = 'L = ' + F(polyLen(p,false)), tw = measureFn(str, s) + 6, rot = normRot(Math.atan2(uy,ux)), o = off(a.lo);
    L.push({key:'lo', str, x:x2+ux*(tw/2+6)+o.x, y:y2+uy*(tw/2+6)+o.y+(Math.abs(uy)>0.9?0:0), rot, size:s});
  } else if(a.type==='area' && a.pts && a.pts.length >= 6 && a.showDim !== false){
    const c = centroid(a.pts), o = off(a.lo), net = areaNet(a), lines = ['A = '+fmtArea(net, ctx)+((a.holes&&a.holes.length)?' (netto)':''), 'O = '+F(polyLen(a.pts,true))];
    const v = volumeM3(a, ctx); if(v != null) lines.push('V = '+(a.vdir==='cut'?'-':'+')+fmtNum(v, ctx&&ctx.dec&&ctx.dec!=='auto'?+ctx.dec:2)+' m³ '+(a.vdir==='cut'?'udgravning':'opbygning'));
    L.push({key:'lo', str:lines.join('\n'), x:c[0]+o.x, y:c[1]+o.y, rot:0, size:s});
  }
  if(a.type==='area' && a.showSides && a.pts && a.pts.length >= 6){
    const p = a.pts, n = p.length/2;
    for(let i=0;i<n;i++){
      const j = (i+1)%n, x1=p[2*i], y1=p[2*i+1], x2=p[2*j], y2=p[2*j+1], d=Math.hypot(x2-x1,y2-y1); if(d < 1) continue;
      const ux=(x2-x1)/d, uy=(y2-y1)/d, mx=(x1+x2)/2, my=(y1+y2)/2, g = s*0.65 + w/2 + 3 + (a.dash==='cloud' ? (10+2*w)/2 : 0);
      const out = inPoly(p, mx+uy*0.5, my-ux*0.5) ? -1 : 1, o = off(a['as'+i]);
      L.push({key:'as'+i, str:F(d), x:mx+uy*g*out+o.x, y:my-ux*g*out+o.y, rot:normRot(Math.atan2(uy,ux)), size:s});
    }
  }
  if(a.type==='angle' && a.pts && a.pts.length === 6){
    const g = angleGeom(a), o = off(a.lo);
    L.push({key:'lo', str:fmtNum(g.deg,1)+'°', x:g.vx+g.bx*(g.r+s*1.3)+o.x, y:g.vy+g.by*(g.r+s*1.3)+o.y, rot:0, size:s});
  } else if(a.type==='circle' && a.showDim){
    const g = s*0.65 + 3, o = off(a.lo);
    if(a.dimKind==='r') L.push({key:'lo', str:'R '+F(a.r), x:a.cx+a.r/2+o.x, y:a.cy-g+o.y, rot:0, size:s});
    else L.push({key:'lo', str:'Ø '+F(2*a.r), x:a.cx+o.x, y:a.cy-g+o.y, rot:0, size:s});
  }
  const dir = a.dimDir, fixed = dir==='h' ? 0 : dir==='v' ? -Math.PI/2 : dir==='c' ? -(+a.dimDeg||0)*Math.PI/180 : null;
  L.forEach(l => { if(fixed != null) l.rot = fixed; l.bg = a.dimBg !== false; });
  L.forEach(l => { const ls = String(l.str).split('\n'); l.w = Math.max(...ls.map(x => measureFn(x, l.size))) + 6; l.h = l.size*(0.4 + 1.25*ls.length) - l.size*0.35; });
  return L;
}
function smoothOps(P){
  if(P.length < 3) return [['M',P[0][0],P[0][1]],['L',(P[1]||P[0])[0]+(P[1]?0:0.01),(P[1]||P[0])[1]]];
  const ops = [['M',P[0][0],P[0][1]]]; let pv = P[0];
  for(let i=1;i<P.length-1;i++){
    const q = P[i], m = [(P[i][0]+P[i+1][0])/2, (P[i][1]+P[i+1][1])/2];
    ops.push(['C', pv[0]+2/3*(q[0]-pv[0]), pv[1]+2/3*(q[1]-pv[1]), m[0]+2/3*(q[0]-m[0]), m[1]+2/3*(q[1]-m[1]), m[0], m[1]]); pv = m;
  }
  const L = P[P.length-1]; ops.push(['L',L[0],L[1]]); return ops;
}
function b64Bytes(src){ const b = src.slice(src.indexOf(',')+1);
  if(typeof atob === 'function'){ const s = atob(b), u = new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; }
  return Uint8Array.from(Buffer.from(b,'base64')); }
function inPoly(p, x, y){ let c = false; const n = p.length/2;
  for(let i=0,j=n-1;i<n;j=i++){ const xi=p[2*i], yi=p[2*i+1], xj=p[2*j], yj=p[2*j+1];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) c = !c; } return c; }
/* Vinkler i en polylinje/et areal i grader. Areal: indvendig vinkel ved hvert hjørne. Polylinje: vinklen mellem de to stykker (0–180) ved de indre punkter. */
function polyAngles(p, closed){
  const n = p.length/2, out = new Array(n).fill(null), raw = new Array(n).fill(null);
  for(let i=0;i<n;i++){
    if(!closed && (i===0 || i===n-1)) continue;
    const a = (i-1+n)%n, b = (i+1)%n, t = Math.atan2(p[2*a+1]-p[2*i+1], p[2*a]-p[2*i]) - Math.atan2(p[2*b+1]-p[2*i+1], p[2*b]-p[2*i]);
    raw[i] = t;
  }
  let flip = false;
  if(closed){ const tw = raw.map(t => ((t % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI)), S = tw.reduce((x,y) => x+y, 0);
    flip = Math.abs(S-(n+2)*Math.PI) < Math.abs(S-(n-2)*Math.PI);
    tw.forEach((t,i) => out[i] = (flip ? 2*Math.PI-t : t)*180/Math.PI); }
  else raw.forEach((t,i) => { if(t==null) return; while(t > Math.PI) t -= 2*Math.PI; while(t <= -Math.PI) t += 2*Math.PI; out[i] = Math.abs(t)*180/Math.PI; raw[i] = t; });
  return {deg:out, raw, flip};
}
/* Sæt længden på side i (punkt i til i+1). Punkterne efter flytter med. */
function setPolySide(p, i, L){
  const n = p.length/2, j = i+1; if(j >= n) return;
  let dx = p[2*j]-p[2*i], dy = p[2*j+1]-p[2*i+1], d = Math.hypot(dx,dy); if(d < 1e-9){ dx = 1; dy = 0; d = 1; }
  const mx = dx/d*(L-d), my = dy/d*(L-d); for(let k=j;k<n;k++){ p[2*k] += mx; p[2*k+1] += my; }
}
/* Sæt vinklen ved hjørne i (grader). Punkterne efter drejer med rundt om hjørnet. */
function setPolyAngle(p, i, deg, closed){
  const n = p.length/2, A = polyAngles(p, closed), cur = A.deg[i]; if(cur == null || i < 1 || i > n-2) return;
  const phi = deg*Math.PI/180, al = cur*Math.PI/180;
  let delta;
  if(closed) delta = A.flip ? (phi-al) : (al-phi);
  else { const t = A.raw[i], target = (t < 0 ? -1 : 1)*phi; delta = t - target; }
  const cx = p[2*i], cy = p[2*i+1], c = Math.cos(delta), s = Math.sin(delta);
  for(let k=i+1;k<n;k++){ const dx = p[2*k]-cx, dy = p[2*k+1]-cy; p[2*k] = cx+dx*c-dy*s; p[2*k+1] = cy+dx*s+dy*c; }
}
function polyLen(p, closed){ let L=0; for(let i=2;i<p.length;i+=2) L+=Math.hypot(p[i]-p[i-2],p[i+1]-p[i-1]);
  if(closed && p.length>=6) L+=Math.hypot(p[0]-p[p.length-2],p[1]-p[p.length-1]); return L; }
function polyArea(p){ let s=0; const n=p.length/2; for(let i=0;i<n;i++){ const j=(i+1)%n; s+=p[2*i]*p[2*j+1]-p[2*j]*p[2*i+1]; } return Math.abs(s)/2; }
function centroid(p){ const n=p.length/2; let A=0,cx=0,cy=0;
  for(let i=0;i<n;i++){ const j=(i+1)%n, f=p[2*i]*p[2*j+1]-p[2*j]*p[2*i+1]; A+=f; cx+=(p[2*i]+p[2*j])*f; cy+=(p[2*i+1]+p[2*j+1])*f; }
  if(Math.abs(A) < 1e-6){ let sx=0,sy=0; for(let i=0;i<n;i++){sx+=p[2*i];sy+=p[2*i+1];} return [sx/n,sy/n]; }
  return [cx/(3*A), cy/(3*A)]; }
function fmtArea(pt2, ctx){
  const c = ctx||{}, d = c.dec && c.dec!=='auto' ? +c.dec : null, f = (v,p) => v.toLocaleString('da-DK',{minimumFractionDigits:p,maximumFractionDigits:p});
  if(!c.scale){ const pu = c.paperUnit==='cm' ? 'cm' : 'mm', k = PT_MM/(pu==='cm'?10:1); return f(pt2*k*k, d ?? (pu==='cm'?1:0)) + ' ' + pu + '² (papir)'; }
  const m2 = pt2*c.scale*c.scale, u = c.unit||'m';
  if(u==='mm') return f(m2*1e6, d ?? 0) + ' mm²';
  if(u==='cm') return f(m2*1e4, d ?? 0) + ' cm²';
  return f(m2, d ?? 2) + ' m²';
}
function fmtNum(v, p){ return v.toLocaleString('da-DK',{minimumFractionDigits:p,maximumFractionDigits:p}); }
function areaNet(a){ let s = polyArea(a.pts); (a.holes||[]).forEach(h => { if(h.length>=6) s -= polyArea(h); }); return Math.max(0, s); }
/* Rumfang i m³: nettoareal × højde/dybde (a.depth i meter). Kræver skala. */
function volumeM3(a, ctx){ if(!a.vdir || !(a.depth > 0) || !(ctx && ctx.scale)) return null; return areaNet(a)*ctx.scale*ctx.scale*a.depth; }
function angleGeom(a){
  const [x1,y1,vx,vy,x2,y2] = a.pts, a1 = Math.atan2(y1-vy,x1-vx), a2 = Math.atan2(y2-vy,x2-vx);
  let d = a2-a1; while(d > Math.PI) d -= 2*Math.PI; while(d <= -Math.PI) d += 2*Math.PI;
  const l1 = Math.hypot(x1-vx,y1-vy), l2 = Math.hypot(x2-vx,y2-vy), r = Math.max(6, Math.min(28, 0.45*Math.min(l1,l2))), m = a1+d/2;
  return {vx, vy, a1, d, r, deg:Math.abs(d)*180/Math.PI, bx:Math.cos(m), by:Math.sin(m)};
}
function fillOf(a, col){ return a.fill==='tint' ? {fill:col, op:0.2} : {fill:FILLS[a.fill]||null, op:1}; }
function stampBox(a){
  const s=a.size||14, pad=s*0.45, ss=s*0.56, lw=measureFn(a.label||'', s, true), sw=a.sub ? measureFn(a.sub, ss) : 0;
  return {x:a.x, y:a.y, w:Math.max(lw,sw)+2*pad+s*0.3, h:s*1.05+(a.sub?ss*1.4:0)+2*pad, s, pad, ss, lw, sw};
}
function markerOps(shape, x, y, r){
  if(shape==='square') return rectOps(x-r*0.9,y-r*0.9,r*1.8,r*1.8);
  if(shape==='triangle') return [['M',x,y-r*1.2],['L',x+r*1.1,y+r*0.75],['L',x-r*1.1,y+r*0.75],['Z']];
  if(shape==='diamond') return [['M',x,y-r*1.25],['L',x+r*1.25,y],['L',x,y+r*1.25],['L',x-r*1.25,y],['Z']];
  return circleOps(x,y,r);
}
const FILLS = {none:null, white:'#ffffff', yellow:'#fff3a8'};

function textBox(a){
  const lines = (a.text||'').split('\n'), lh = a.size*1.2;
  const w = Math.max(16, ...lines.map(l => measureFn(l, a.size))) + 2*PAD;
  return {x:a.x, y:a.y, w, h: lines.length*lh + 2*PAD, lines, lh};
}
function edgePoint(b, tx, ty){
  const cx = b.x+b.w/2, cy = b.y+b.h/2, dx = tx-cx, dy = ty-cy;
  if(Math.abs(dx) <= b.w/2 && Math.abs(dy) <= b.h/2) return null;
  const t = Math.min(dx ? (b.w/2)/Math.abs(dx) : Infinity, dy ? (b.h/2)/Math.abs(dy) : Infinity);
  return [cx+dx*t, cy+dy*t];
}
function bbox(a){
  if(a.type==='line'||a.type==='measure') return {x:Math.min(a.x1,a.x2), y:Math.min(a.y1,a.y2), w:Math.abs(a.x2-a.x1), h:Math.abs(a.y2-a.y1)};
  if(a.type==='rect') return {x:a.x,y:a.y,w:a.w,h:a.h};
  if(a.type==='circle') return {x:a.cx-a.r,y:a.cy-a.r,w:2*a.r,h:2*a.r};
  if(a.type==='sign'||a.type==='symbol') return {x:a.x,y:a.y,w:a.w,h:a.h};
  if(a.type==='stamp'){ const b=stampBox(a); return {x:b.x,y:b.y,w:b.w,h:b.h}; }
  if(a.type==='count'){ const r=(a.size||9)/2*1.3; return {x:a.x-r,y:a.y-r,w:2*r,h:2*r}; }
  if(a.type==='poly'||a.type==='area'||a.type==='angle'){ const p=a.pts||[0,0]; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);} return {x:x0,y:y0,w:x1-x0,h:y1-y0}; }
  return textBox(a);
}

/* Primitiver: {k:'path', ops, stroke, fill, width, dash, cap} | {k:'text', x, y, str, size, color} */
function prims(a, ctx){
  const out = [], col = a.color, w = a.width||1, ds = dashFor(a);
  const line = (ops, extra={}) => out.push(Object.assign({k:'path', ops, stroke:col, fill:null, width:w, dash:ds.arr, cap:ds.cap}, extra));
  if(a.type === 'line'){
    let {x1,y1,x2,y2} = a; const d = Math.hypot(x2-x1,y2-y1)||1, ux=(x2-x1)/d, uy=(y2-y1)/d, cut = arrowLen(w)*0.7;
    const sx = a.arrowStart ? x1+ux*cut : x1, sy = a.arrowStart ? y1+uy*cut : y1;
    const ex = a.arrowEnd ? x2-ux*cut : x2, ey = a.arrowEnd ? y2-uy*cut : y2;
    line([['M',sx,sy],['L',ex,ey]]);
    if(a.arrowEnd) out.push({k:'path', ops:arrowHead(x1,y1,x2,y2,w), stroke:null, fill:col});
    if(a.arrowStart) out.push({k:'path', ops:arrowHead(x2,y2,x1,y1,w), stroke:null, fill:col});
  }
  else if(a.type === 'measure'){
    const {x1,y1,x2,y2} = a, d = Math.hypot(x2-x1,y2-y1)||1, ux=(x2-x1)/d, uy=(y2-y1)/d, nx = -uy*5, ny = ux*5;
    if(a.ends === 'arrow'){
      const cut = arrowLen(w)*0.7, e = 1.5;
      line([['M',x1+ux*cut,y1+uy*cut],['L',x2-ux*cut,y2-uy*cut],['M',x1+nx*e,y1+ny*e],['L',x1-nx*e,y1-ny*e],['M',x2+nx*e,y2+ny*e],['L',x2-nx*e,y2-ny*e]], {dash:null, cap:0});
      out.push({k:'path', ops:arrowHead(x2,y2,x1,y1,w), stroke:null, fill:col});
      out.push({k:'path', ops:arrowHead(x1,y1,x2,y2,w), stroke:null, fill:col});
    } else {
      line([['M',x1,y1],['L',x2,y2],['M',x1+nx,y1+ny],['L',x1-nx,y1-ny],['M',x2+nx,y2+ny],['L',x2-nx,y2-ny]], {dash:null, cap:0});
    }
  }
  else if(a.type === 'rect'){
    const ops = a.dash==='cloud' ? cloudOps(a.x,a.y,a.w,a.h,w) : rectOps(a.x,a.y,a.w,a.h);
    { const fo = fillOf(a,col); out.push({k:'path', ops, stroke: a.dash==='none'?null:col, fill:fo.fill, op:fo.op, width:w, dash:ds.arr, cap:ds.cap}); }
  }
  else if(a.type === 'circle'){
    const ops = a.dash==='cloud' ? cloudCircleOps(a.cx,a.cy,a.r,w) : circleOps(a.cx,a.cy,a.r);
    { const fo = fillOf(a,col); out.push({k:'path', ops, stroke: a.dash==='none'?null:col, fill:fo.fill, op:fo.op, width:w, dash:ds.arr, cap:ds.cap}); }
    if(a.showDim){
      const lw=0.75, cut=arrowLen(lw)*0.7, s=a.size||10, {cx,cy,r}=a, sc=ctx&&ctx.scale, un=ctx&&ctx.unit;
      out.push({k:'path', ops:[['M',cx,cy-2],['L',cx,cy+2],['M',cx-2,cy],['L',cx+2,cy]], stroke:col, fill:null, width:lw, dash:null, cap:0});
      if(a.dimKind==='r'){
        out.push({k:'path', ops:[['M',cx,cy],['L',cx+r-cut,cy]], stroke:col, fill:null, width:lw, dash:null, cap:0});
        out.push({k:'path', ops:arrowHead(cx,cy,cx+r,cy,lw), stroke:null, fill:col});
      } else {
        out.push({k:'path', ops:[['M',cx-r+cut,cy],['L',cx+r-cut,cy]], stroke:col, fill:null, width:lw, dash:null, cap:0});
        out.push({k:'path', ops:arrowHead(cx,cy,cx+r,cy,lw), stroke:null, fill:col});
        out.push({k:'path', ops:arrowHead(cx,cy,cx-r,cy,lw), stroke:null, fill:col});
      }
    }
  }
  else if(a.type === 'poly' || a.type === 'area'){
    const p = a.pts||[], closed = a.type==='area'; if(p.length >= 4){
      let ops;
      if(closed && a.dash==='cloud' && p.length >= 6) ops = cloudPoly(pairs(p), w);
      else { ops = [['M',p[0],p[1]]]; for(let i=2;i<p.length;i+=2) ops.push(['L',p[i],p[i+1]]); if(closed) ops.push(['Z']); }
      const holes = closed ? (a.holes||[]).filter(h => h.length>=6) : [];
      holes.forEach(h => { ops.push(['M',h[0],h[1]]); for(let i=2;i<h.length;i+=2) ops.push(['L',h[i],h[i+1]]); ops.push(['Z']); });
      const fo = closed ? fillOf(a,col) : {fill:null, op:1};
      out.push({k:'path', ops, stroke:a.dash==='none'?null:col, fill:fo.fill, op:fo.op, width:w, dash:a.dash==='cloud'?null:ds.arr, cap:ds.cap, evenOdd:holes.length>0}); }
  }
  else if(a.type === 'angle'){
    if(a.pts && a.pts.length >= 4){
      const p = a.pts, ops = [['M',p[0],p[1]],['L',p[2],p[3]]]; if(p.length >= 6) ops.push(['L',p[4],p[5]]);
      out.push({k:'path', ops, stroke:col, fill:null, width:w, dash:null, cap:0});
      if(p.length === 6){ const g = angleGeom(a), arc = [], n = Math.max(6, Math.ceil(Math.abs(g.d)/(Math.PI/36)));
        for(let i=0;i<=n;i++){ const t = g.a1 + g.d*i/n; arc.push([i?'L':'M', g.vx+Math.cos(t)*g.r, g.vy+Math.sin(t)*g.r]); }
        out.push({k:'path', ops:arc, stroke:col, fill:null, width:Math.max(0.6,w*0.7), dash:null, cap:0}); }
    }
  }
  else if(a.type === 'count'){
    const g = ((ctx && ctx.groups) || []).find(g => g.id===a.group) || {color:'#e03131', shape:'circle'}, r = (a.size||9)/2;
    out.push({k:'path', ops:markerOps(g.shape, a.x, a.y, r), stroke:'#ffffff', fill:g.color, width:Math.max(0.6, r*0.22), dash:null, cap:0});
  }
  else if(a.type === 'stamp'){
    const b = stampBox(a), s = b.s, i = s*0.2;
    out.push({k:'path', ops:rectOps(b.x,b.y,b.w,b.h), stroke:col, fill:null, width:s*0.11, dash:null, cap:0});
    out.push({k:'path', ops:rectOps(b.x+i,b.y+i,b.w-2*i,b.h-2*i), stroke:col, fill:null, width:s*0.035, dash:null, cap:0});
    out.push({k:'text', x:b.x+(b.w-b.lw)/2, y:b.y+b.pad+s*0.85, str:a.label||'', size:s, color:col, bold:true});
    if(a.sub) out.push({k:'text', x:b.x+(b.w-b.sw)/2, y:b.y+b.pad+s*1.05+b.ss*1.15, str:a.sub, size:b.ss, color:col});
  }
  else if(a.type === 'sign' || a.type === 'symbol'){
    if(a.src) out.push({k:'image', x:a.x, y:a.y, w:a.w, h:a.h, src:a.src});
    else if(a.ink){ const lw = Math.max(0.3, (a.lw||0.03)*a.h);
      a.ink.forEach(pth => { const P=[]; for(let i=0;i<pth.length;i+=2) P.push([a.x+pth[i]*a.w, a.y+pth[i+1]*a.h]);
        if(P.length) out.push({k:'path', ops:smoothOps(P), stroke:col||'#111111', fill:null, width:lw, dash:null, cap:1}); }); }
  }
  else if(a.type === 'text'){
    const b = textBox(a);
    if(a.leader){
      const e = edgePoint(b, a.leader.x, a.leader.y);
      if(e){ const lw = Math.max(w, 0.75), d = Math.hypot(a.leader.x-e[0], a.leader.y-e[1])||1, cut = arrowLen(lw)*0.7;
        out.push({k:'path', ops:[['M',e[0],e[1]],['L',a.leader.x-(a.leader.x-e[0])/d*cut, a.leader.y-(a.leader.y-e[1])/d*cut]], stroke:col, fill:null, width:lw, dash:null, cap:0});
        out.push({k:'path', ops:arrowHead(e[0],e[1],a.leader.x,a.leader.y,lw), stroke:null, fill:col}); }
    }
    const ops = a.dash==='cloud' ? cloudOps(b.x,b.y,b.w,b.h,w) : rectOps(b.x,b.y,b.w,b.h);
    const stroke = a.dash==='none' ? null : col, fo = fillOf(a,col), fill = fo.fill;
    if(stroke || fill) out.push({k:'path', ops, stroke, fill, op:fo.op, width:w, dash:ds.arr, cap:ds.cap});
    if(!(ctx && ctx.editing && ctx.editing === a.id)) b.lines.forEach((l,i) => { if(l) out.push({k:'text', x:b.x+PAD, y:b.y+PAD+i*b.lh+a.size*0.88, str:l, size:a.size, color:a.textColor||col}); });
  }
  if(a.type !== 'text') dimLabels(a, ctx).forEach(l => labelPrims(out, l, col));
  return out;
}

const r2 = n => Math.round(n*100)/100;
function opsToD(ops){ return ops.map(o => o[0] + (o.length>1 ? o.slice(1).map(r2).join(' ') : '')).join(''); }
function escX(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function primsToSvg(ps){
  return ps.map(p => {
    if(p.k === 'image') return `<image href="${p.src}" x="${r2(p.x)}" y="${r2(p.y)}" width="${r2(p.w)}" height="${r2(p.h)}" preserveAspectRatio="none"/>`;
    if(p.k === 'text') return `<text x="${r2(p.x)}" y="${r2(p.y)}"${p.bold?' font-weight="bold"':''}${p.rot?` transform="rotate(${r2(p.rot*180/Math.PI)} ${r2(p.x)} ${r2(p.y)})"`:''} font-size="${p.size}" fill="${p.color}" font-family="Helvetica, Arial, sans-serif" xml:space="preserve">${escX(p.str)}</text>`;
    return `<path d="${opsToD(p.ops)}"${p.evenOdd?' fill-rule="evenodd"':''} fill="${p.fill||'none'}"${p.op&&p.op<1?` fill-opacity="${p.op}"`:''} stroke="${p.stroke||'none'}"${p.stroke?` stroke-width="${p.width}" stroke-linejoin="round" stroke-linecap="${p.cap?'round':'butt'}"${p.dash?` stroke-dasharray="${p.dash.map(r2).join(' ')}"`:''}`:''}/>`;
  }).join('');
}

/* ---------- PDF-eksport ---------- */
function hexRgb(h){ const n = parseInt(h.slice(1),16); return [(n>>16&255)/255, (n>>8&255)/255, (n&255)/255]; }
function invert(m){ const [a,b,c,d,e,f] = m, det = a*d - b*c; return [d/det, -b/det, -c/det, a/det, (c*f - d*e)/det, (b*e - a*f)/det]; }

/* layers: [{id,name}], annotsFor(pageIndex, layerId) -> annots, pageInfo(i) -> {transform, scale, unit}; mode: 'ocg' | 'flat' */
async function buildPdf(PDFLib, bytes, opts){
  const L = PDFLib, {PDFDocument, StandardFonts, PDFName, PDFHexString, PDFArray, PDFDict, PDFOperator} = L;
  const pdf = await PDFDocument.load(bytes, {updateMetadata:false});
  const ctx = pdf.context, font = await pdf.embedFont(StandardFonts.Helvetica), fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const gsRef = ctx.register(ctx.obj({Type:'ExtGState', ca:0.2}));
  const info = opts.info || (opts.info = {}); info.fields = 0; info.flattened = false; info.error = null;
  if(opts.flattenForm && pdf.catalog.lookup(PDFName.of('AcroForm'))){
    try{
      const form = pdf.getForm(); info.fields = form.getFields().length;
      if(info.fields){ try{ form.flatten(); }catch(e1){ form.flatten({updateFieldAppearances:false}); } info.flattened = true; }
      if(info.flattened){ /* udfyld huller efter slettede felt-objekter, så xref-tabellen er ren */
        const have = new Set(ctx.enumerateIndirectObjects().map(([r]) => r.objectNumber));
        for(let n=1;n<=ctx.largestObjectNumber;n++) if(!have.has(n)) ctx.assign(L.PDFRef.of(n,0), L.PDFNull); }
    }catch(e){ info.error = String(e && e.message || e); }
  }
  const charset = new Set(font.getCharacterSet());
  const clean = s => Array.from(s).map(ch => charset.has(ch.codePointAt(0)) ? ch : '?').join('');
  const prevMeasure = measureFn; measureFn = (s, size, bold) => (bold ? fontB : font).widthOfTextAtSize(clean(String(s)), size);
  try{
  const ocg = {};
  if(opts.mode === 'ocg' || opts.mode === 'annot'){
    const refs = opts.layers.map(l => (ocg[l.id] = ctx.register(ctx.obj({Type:'OCG', Name: PDFHexString.fromText(l.name)}))));
    let ocp = pdf.catalog.lookup(PDFName.of('OCProperties'));
    if(ocp instanceof PDFDict){
      let arr = ocp.lookup(PDFName.of('OCGs')); if(!(arr instanceof PDFArray)){ arr = ctx.obj([]); ocp.set(PDFName.of('OCGs'), arr); }
      refs.forEach(r => arr.push(r));
      let D = ocp.lookup(PDFName.of('D')); if(!(D instanceof PDFDict)){ D = ctx.obj({}); ocp.set(PDFName.of('D'), D); }
      const order = D.lookup(PDFName.of('Order'));
      if(order instanceof PDFArray) refs.forEach(r => order.push(r));
      const off = D.lookup(PDFName.of('OFF'));
      if(!(order instanceof PDFArray) && !(off instanceof PDFArray)) {/* intet at gøre */}
    } else {
      pdf.catalog.set(PDFName.of('OCProperties'), ctx.obj({OCGs: refs, D: {Order: refs, ON: refs}}));
    }
  }
  const pages = pdf.getPages(), imgs = {};
  for(let i=0;i<pages.length;i++) for(const l of opts.layers) for(const a of opts.annotsFor(i, l.id))
    if((a.type==='sign'||a.type==='symbol') && a.src && !imgs[a.src]) imgs[a.src] = await pdf.embedPng(b64Bytes(a.src));
  const asAnnot = a => opts.mode === 'annot' && a.type !== 'sign';
  /* tegneoperatorer for primitiver; R giver navnene på skrift, gennemsigtighed og billeder */
  const primOps = (p, R, ops) => {
    if(p.k === 'image'){
      ops.push(L.pushGraphicsState(), L.concatTransformationMatrix(p.w,0,0,-p.h,p.x,p.y+p.h), L.drawObject(R.img(p.src)), L.popGraphicsState());
      return;
    }
    if(p.k === 'text'){
      ops.push(L.pushGraphicsState(), L.setFillingRgbColor(...hexRgb(p.color)), L.beginText(), L.setFontAndSize(p.bold ? R.fontB : R.font, p.size),
        L.setTextMatrix(Math.cos(p.rot||0),Math.sin(p.rot||0),Math.sin(p.rot||0),-Math.cos(p.rot||0),p.x,p.y), L.showText((p.bold ? fontB : font).encodeText(clean(p.str))), L.endText(), L.popGraphicsState());
      return;
    }
    ops.push(L.pushGraphicsState());
    if(p.stroke){ ops.push(L.setStrokingRgbColor(...hexRgb(p.stroke)), L.setLineWidth(p.width), L.setLineCap(p.cap ? L.LineCapStyle.Round : L.LineCapStyle.Butt), L.setDashPattern(p.dash || [], 0)); }
    if(p.fill) ops.push(L.setFillingRgbColor(...hexRgb(p.fill)));
    if(p.fill && p.op && p.op < 1) ops.push(L.setGraphicsState(R.gs));
    p.ops.forEach(o => {
      if(o[0]==='M') ops.push(L.moveTo(o[1],o[2])); else if(o[0]==='L') ops.push(L.lineTo(o[1],o[2]));
      else if(o[0]==='C') ops.push(L.appendBezierCurve(o[1],o[2],o[3],o[4],o[5],o[6])); else ops.push(L.closePath());
    });
    ops.push(p.evenOdd && p.fill ? PDFOperator.of(p.stroke ? 'B*' : 'f*', []) : p.fill && p.stroke ? L.fillAndStroke() : p.fill ? L.fill() : L.stroke());
    ops.push(L.popGraphicsState());
  };
  for(let i=0;i<pages.length;i++){
    const all = opts.layers.map(l => ({l, as: opts.annotsFor(i, l.id)})).filter(g => g.as.length);
    if(!all.length) continue;
    const pg = pages[i], node = pg.node; node.normalize();
    const info = opts.pageInfo(i);
    if(opts.mode === 'annot') all.forEach(g => g.as.filter(asAnnot).forEach(a => {
      const ref = makeAnnot(a, info, ocg[g.l.id], g.l); if(ref) node.addAnnot(ref);
    }));
    const groups = all.map(g => ({l:g.l, as:g.as.filter(a => !asAnnot(a))})).filter(g => g.as.length);
    if(!groups.length) continue;
    const fontKey = node.newFontDictionary('BladrHelv', font.ref), fontKeyB = node.newFontDictionary('BladrHelvB', fontB.ref), gsKey = node.newExtGState('BladrGS', gsRef);
    const R = {font:fontKey, fontB:fontKeyB, gs:gsKey, img: src => node.newXObject('BladrImg', imgs[src].ref)};
    const start = ctx.register(ctx.contentStream([L.pushGraphicsState()])), end = ctx.register(ctx.contentStream([L.popGraphicsState()]));
    node.wrapContentStreams(start, end);
    const ops = [L.pushGraphicsState(), L.concatTransformationMatrix(...invert(info.transform)), L.setLineJoin(L.LineJoinStyle.Round)];
    groups.forEach((g, gi) => {
      if(ocg[g.l.id]){
        const res = node.Resources(); let props = res.lookup(PDFName.of('Properties'));
        if(!(props instanceof PDFDict)){ props = ctx.obj({}); res.set(PDFName.of('Properties'), props); }
        const key = 'BladrOC' + gi; props.set(PDFName.of(key), ocg[g.l.id]);
        ops.push(PDFOperator.of('BDC', [PDFName.of('OC'), PDFName.of(key)]));
      }
      g.as.forEach(a => prims(a, info).forEach(p => primOps(p, R, ops)));
      if(ocg[g.l.id]) ops.push(PDFOperator.of('EMC', []));
    });
    ops.push(L.popGraphicsState());
    pg.pushOperators(...ops);
  }

  /* Redigerbar PDF-kommentar med Bladrs eget udseende (AP) og data til at hente den tilbage */
  function makeAnnot(a, info, ocRef, layer){
    const ps = prims(a, info); if(!ps.length) return null;
    const inv = invert(info.transform), U = (x,y) => [inv[0]*x+inv[2]*y+inv[4], inv[1]*x+inv[3]*y+inv[5]];
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; const grow = (x,y,pad) => { x0=Math.min(x0,x-pad); x1=Math.max(x1,x+pad); y0=Math.min(y0,y-pad); y1=Math.max(y1,y+pad); };
    ps.forEach(p => {
      if(p.k === 'path'){ const pad = (p.stroke ? p.width/2 : 0) + 0.5; p.ops.forEach(o => { for(let k=1;k<o.length;k+=2) grow(o[k],o[k+1],pad); }); }
      else if(p.k === 'image') { grow(p.x,p.y,0); grow(p.x+p.w,p.y+p.h,0); }
      else { const w = measureFn(p.str, p.size, p.bold), c = Math.cos(p.rot||0), s = Math.sin(p.rot||0);
        [[0,-p.size],[w,-p.size],[w,p.size*0.3],[0,p.size*0.3]].forEach(([u,v]) => grow(p.x+u*c-v*s, p.y+u*s+v*c, 0.5)); }
    });
    const userBox = (bx0,by0,bx1,by1) => { const q = [U(bx0,by0),U(bx1,by0),U(bx1,by1),U(bx0,by1)];
      return [Math.min(...q.map(p=>p[0])), Math.min(...q.map(p=>p[1])), Math.max(...q.map(p=>p[0])), Math.max(...q.map(p=>p[1]))]; };
    const rect = userBox(x0,y0,x1,y1);
    const res = {Font:{BH:font.ref, BHB:fontB.ref}, ExtGState:{BGS:gsRef}, XObject:{}};
    let ni = 0; const R = {font:PDFName.of('BH'), fontB:PDFName.of('BHB'), gs:PDFName.of('BGS'), img: src => { const n = 'BI'+(ni++); res.XObject[n] = imgs[src].ref; return PDFName.of(n); }};
    const ops = [L.concatTransformationMatrix(...inv), L.setLineJoin(L.LineJoinStyle.Round)];
    ps.forEach(p => primOps(p, R, ops));
    const ap = ctx.register(ctx.formXObject(ops, {BBox: rect, Resources: res}));
    const col = hexRgb(a.color || '#e03131'), w = a.width || 1, now = new Date(a.modified || a.created || Date.now());
    const txt = s => PDFHexString.fromText(String(s||''));
    const d = {Type:'Annot', Rect:rect, F:4, AP:{N:ap}, NM:txt('bladr-'+a.id), T:txt(a.author||''), M:L.PDFString.fromDate(now), CreationDate:L.PDFString.fromDate(new Date(a.created||Date.now())),
      C:col, Contents:txt(opts.contentsOf ? opts.contentsOf(a) : (a.note||'')), Subj:txt(opts.subjOf ? opts.subjOf(a) : a.type)};
    if(ocRef) d.OC = ocRef;
    const bs = {W: a.dash==='none' ? 0 : w, S: a.dash==='dash'||a.dash==='dot' ? 'D' : 'S'}; if(bs.S==='D') bs.D = dashFor(a).arr.map(v => Math.max(0.5, v));
    const fo = fillOf(a, a.color||'#000000');
    const inset = (bx,by,bw,bh) => { const r = userBox(bx,by,bx+bw,by+bh); return [r[0]-rect[0], r[1]-rect[1], rect[2]-r[2], rect[3]-r[3]].map(v => Math.max(0, v)); };
    const flat = arr => { const o = []; for(let k=0;k<arr.length;k+=2) o.push(...U(arr[k],arr[k+1])); return o; };
    const t = a.type;
    if(t==='line' || t==='measure'){
      Object.assign(d, {Subtype:'Line', L:[...U(a.x1,a.y1), ...U(a.x2,a.y2)], BS:bs, IC:col});
      d.LE = t==='measure' ? (a.ends==='arrow' ? ['ClosedArrow','ClosedArrow'] : ['Butt','Butt']) : [a.arrowStart?'ClosedArrow':'None', a.arrowEnd?'ClosedArrow':'None'];
    } else if(t==='rect' || t==='circle'){
      const b = t==='rect' ? {x:a.x,y:a.y,w:a.w,h:a.h} : {x:a.cx-a.r,y:a.cy-a.r,w:2*a.r,h:2*a.r};
      Object.assign(d, {Subtype: t==='rect' ? 'Square' : 'Circle', BS:bs, RD:inset(b.x,b.y,b.w,b.h)});
      if(fo.fill) d.IC = hexRgb(fo.fill);
      if(a.dash==='cloud') d.BE = {S:'C', I:1};
    } else if(t==='poly' || t==='area' || t==='angle'){
      Object.assign(d, {Subtype: t==='area' ? 'Polygon' : 'PolyLine', Vertices: flat(a.pts||[]), BS:bs});
      if(t==='area' && fo.fill) d.IC = hexRgb(fo.fill);
      if(t==='area' && a.dash==='cloud') d.BE = {S:'C', I:1};
    } else if(t==='text'){
      const b = textBox(a), tc = hexRgb(a.textColor || a.color || '#000000');
      Object.assign(d, {Subtype:'FreeText', BS:bs, DA:L.PDFString.of(`/Helv ${a.size} Tf ${tc.map(v=>+v.toFixed(3)).join(' ')} rg`), Contents:txt(a.text), RD:inset(b.x,b.y,b.w,b.h)});
      d.C = fo.fill ? hexRgb(fo.fill) : [];
      if(a.leader){ const e = edgePoint(b, a.leader.x, a.leader.y) || [b.x, b.y+b.h/2]; d.IT = 'FreeTextCallout'; d.CL = [...U(a.leader.x,a.leader.y), ...U(e[0],e[1])]; d.LE = 'ClosedArrow'; }
    } else {
      Object.assign(d, {Subtype:'Stamp', Name: t==='count' ? 'Bladr#20Count' : 'Bladr'});
    }
    const data = {v:1, a:Object.assign({}, a), layer: layer && layer.name};
    if(t==='count'){ const g = (info.groups||[]).find(x => x.id===a.group); if(g) data.group = g; }
    d.BladrData = txt(JSON.stringify(data));
    const dict = ctx.obj(d);
    if(d.Subtype==='Stamp') dict.set(PDFName.of('Name'), PDFName.of(t==='count' ? 'BladrCount' : 'Bladr'));
    return ctx.register(dict);
  }
  return await pdf.save();
  } finally { measureFn = prevMeasure; }
}

/* ---------- PDF-kommentarer ind i Bladr ----------
   Læser kommentarer (Bluebeam, Adobe m.fl.) og laver dem om til Bladr-markeringer i visningsrum.
   transforms[i] er sidens visnings-transform (PDF-rum -> visningsrum ved zoom 1).
   Returnerer {items:[{page, a, layer, group}], skipped, bytes}: bytes er PDF'en uden de overtagne kommentarer. */
const IMPORTABLE = ['Line','Square','Circle','Polygon','PolyLine','FreeText','Ink','Text','Highlight','Underline','StrikeOut','Squiggly','Stamp'];
async function readAnnots(PDFLib, bytes, transforms, o){
  o = o || {}; const L = PDFLib, {PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFString, PDFHexString, PDFRef} = L;
  const pdf = await PDFDocument.load(bytes, {updateMetadata:false, ignoreEncryption:true}), ctx = pdf.context;
  const N = k => PDFName.of(k), get = (d,k) => d.lookup(N(k));
  const str = v => (v instanceof PDFString || v instanceof PDFHexString) ? v.decodeText() : '';
  const nm = v => v instanceof PDFName ? v.decodeText() : '';
  const nums = v => v instanceof PDFArray ? v.asArray().map(x => { x = ctx.lookup(x); return x instanceof PDFNumber ? x.asNumber() : 0; }) : null;
  const hex = c => { if(!c || !c.length) return null; let r,g,b; if(c.length===1) r=g=b=c[0]; else if(c.length===3) [r,g,b]=c; else if(c.length===4){ const k=c[3]; r=(1-c[0])*(1-k); g=(1-c[1])*(1-k); b=(1-c[2])*(1-k); } else return null;
    return '#'+[r,g,b].map(v => Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join(''); };
  const date = s => { const m = /D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?/.exec(s||''); if(!m) return null; return new Date(+m[1], (+m[2]||1)-1, +m[3]||1, +m[4]||0, +m[5]||0, +m[6]||0).getTime(); };
  const items = []; let skipped = 0, changed = false;
  pdf.getPages().forEach((pg, pi) => {
    const arr = pg.node.lookup(N('Annots'));
    if(!(arr instanceof PDFArray)) return;
    const T = transforms[pi], V = (x,y) => [T[0]*x+T[2]*y+T[4], T[1]*x+T[3]*y+T[5]];
    const VB = r => { const q = [V(r[0],r[1]),V(r[2],r[1]),V(r[2],r[3]),V(r[0],r[3])]; const xs=q.map(p=>p[0]), ys=q.map(p=>p[1]); return {x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys)}; };
    const pts = v => { const n = nums(v)||[], out = []; for(let k=0;k+1<n.length;k+=2) out.push(...V(n[k],n[k+1])); return out; };
    const drop = new Set(), entries = arr.asArray();
    entries.forEach(entry => {
      const d = ctx.lookup(entry); if(!(d instanceof PDFDict)) return;
      const st = nm(get(d,'Subtype')); if(st==='Popup' || st==='Link' || st==='Widget') return;
      const conv = convert(d, st);
      if(!conv){ if(IMPORTABLE.includes(st) || nm(get(d,'Subtype'))) skipped++; return; }
      conv.page = pi; items.push(conv); drop.add(String(entry));
      const pop = d.get(N('Popup')); if(pop) drop.add(String(pop));
    });
    if(!drop.size) return;
    entries.forEach(entry => { const d = ctx.lookup(entry); if(d instanceof PDFDict){ const par = d.get(N('Parent')); if(par && drop.has(String(par)) && nm(get(d,'Subtype'))==='Popup') drop.add(String(entry)); } });
    pg.node.set(N('Annots'), ctx.obj(entries.filter(e => !drop.has(String(e)))));
    changed = true;

    function convert(d, st){
      const bd = get(d,'BladrData');
      const ocg = get(d,'OC'), layer = ocg instanceof PDFDict ? str(get(ocg,'Name')) : '';
      if(bd){ try{ const j = JSON.parse(str(bd)); if(j && j.a) return {a:j.a, layer:j.layer||layer, group:j.group||null, own:true}; }catch(e){} }
      if(!IMPORTABLE.includes(st) || st==='Stamp') return null;
      const rect = nums(get(d,'Rect')); if(!rect) return null;
      const color = hex(nums(get(d,'C'))) || '#e03131', bs = get(d,'BS'), bsd = bs instanceof PDFDict ? bs : null;
      let width = bsd && get(bsd,'W') instanceof PDFNumber ? get(bsd,'W').asNumber() : (nums(get(d,'Border'))||[0,0,1])[2]; if(!(width>=0)) width = 1;
      const be = get(d,'BE'), cloud = be instanceof PDFDict && nm(get(be,'S'))==='C';
      const dash = cloud ? 'cloud' : width===0 ? 'none' : bsd && nm(get(bsd,'S'))==='D' ? 'dash' : 'solid';
      const ic = hex(nums(get(d,'IC'))), fill = ic ? (ic==='#ffffff' ? 'white' : 'tint') : 'none';
      const note = str(get(d,'Contents')), base = {color, width:Math.max(0.5,width||1), dash, author:str(get(d,'T')), created:date(str(get(d,'CreationDate')))||date(str(get(d,'M')))||Date.now()};
      const rd = nums(get(d,'RD')) || [0,0,0,0], inner = [rect[0]+rd[0], rect[1]+rd[1], rect[2]-rd[2], rect[3]-rd[3]];
      let a = null;
      if(st==='Line'){ const l = nums(get(d,'L')); if(!l) return null; const p1 = V(l[0],l[1]), p2 = V(l[2],l[3]), le = get(d,'LE'), les = le instanceof PDFArray ? le.asArray().map(x => nm(x)) : [];
        const arrow = x => /Arrow/.test(x||'');
        a = get(d,'Measure') ? Object.assign(base, {type:'measure', x1:p1[0], y1:p1[1], x2:p2[0], y2:p2[1], ends:arrow(les[0])||arrow(les[1])?'arrow':'tick', note})
          : Object.assign(base, {type:'line', x1:p1[0], y1:p1[1], x2:p2[0], y2:p2[1], arrowStart:arrow(les[0]), arrowEnd:arrow(les[1]), note}); }
      else if(st==='Square'){ const b = VB(inner); a = Object.assign(base, {type:'rect', x:b.x, y:b.y, w:b.w, h:b.h, fill, note}); }
      else if(st==='Circle'){ const b = VB(inner); a = Object.assign(base, {type:'circle', cx:b.x+b.w/2, cy:b.y+b.h/2, r:Math.max(1,(b.w+b.h)/4), fill, note}); }
      else if(st==='Polygon' || st==='PolyLine'){ const p = pts(get(d,'Vertices')); if(p.length < 4) return null;
        a = Object.assign(base, {type: st==='Polygon' ? 'area' : 'poly', pts:p, note}, st==='Polygon' ? {fill, showDim:false} : {}); if(st==='Polygon' && dash==='cloud') a.dash = 'cloud'; }
      else if(st==='Ink'){ const ink = get(d,'InkList'); if(!(ink instanceof PDFArray)) return null; const list = ink.asArray().map(x => pts(ctx.lookup(x))).filter(p => p.length >= 4);
        if(!list.length) return null; return {multi: list.map(p => Object.assign({}, base, {type:'poly', pts:p, note, dash: dash==='cloud'?'solid':dash})), layer}; }
      else if(st==='FreeText'){
        const da = str(get(d,'DA')), fs = /([\d.]+)\s+Tf/.exec(da), rg = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da), g1 = /([\d.]+)\s+g\b/.exec(da);
        const tcol = rg ? hex([+rg[1],+rg[2],+rg[3]]) : g1 ? hex([+g1[1]]) : '#000000', bg = hex(nums(get(d,'C')));
        const size = Math.max(6, Math.min(72, fs ? +fs[1] || 10 : 10)), b = VB(inner);
        const rc = str(get(d,'RC')).replace(/<[^>]+>/g,''), text = (note || rc).replace(/\r\n?/g,'\n');
        a = Object.assign(base, {type:'text', x:b.x, y:b.y, text, size, color: width===0 ? tcol : color, textColor:tcol, width:Math.max(0.5,width||1), dash: width===0 ? 'none' : dash==='none'?'solid':dash, fill: bg ? (bg==='#ffffff' ? 'white' : bg==='#fff3a8'||/^#ff[ef]/.test(bg) ? 'yellow' : 'white') : 'none'});
        if(!bsd && !get(d,'Border')){ a.dash = 'none'; a.color = tcol; }
        const cl = nums(get(d,'CL')); if(cl && cl.length >= 4){ const tip = V(cl[0],cl[1]); a.leader = {x:tip[0], y:tip[1]}; }
      }
      else if(st==='Text'){ const b = VB(rect); a = Object.assign(base, {type:'text', x:b.x, y:b.y, text: note || '(note)', size:9, color, textColor:'#212529', width:1, dash:'solid', fill:'yellow'}); }
      else if(st==='Highlight' || st==='Underline' || st==='StrikeOut' || st==='Squiggly'){
        const q = nums(get(d,'QuadPoints')); if(!q || q.length < 8) return null; const out = [];
        for(let k=0;k+7<q.length;k+=8){ const P = [V(q[k],q[k+1]),V(q[k+2],q[k+3]),V(q[k+4],q[k+5]),V(q[k+6],q[k+7])], xs = P.map(p=>p[0]), ys = P.map(p=>p[1]);
          const bx = {x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys)};
          if(st==='Highlight') out.push(Object.assign({}, base, {type:'rect', x:bx.x, y:bx.y, w:bx.w, h:bx.h, fill:'tint', dash:'none', note}));
          else { const yy = st==='StrikeOut' ? bx.y+bx.h/2 : bx.y+bx.h-0.5; out.push(Object.assign({}, base, {type:'line', x1:bx.x, y1:yy, x2:bx.x+bx.w, y2:yy, width:1, dash:'solid', note})); } }
        return {multi:out, layer};
      }
      return a ? {a, layer} : null;
    }
  });
  const flat = []; items.forEach(it => { if(it.multi) it.multi.forEach(a => flat.push({a, layer:it.layer, page:it.page})); else flat.push(it); });
  return {items:flat, skipped, bytes: changed ? await pdf.save() : null};
}

/* Låst billedkopi: hver side renderes til et billede og lægges i en ny PDF */
async function rasterizePdf(pdfjsLib, PDFLib, bytes, o){
  o = o || {}; const dpi = o.dpi || 200, maxPx = o.maxPx || 7000;
  const src = await pdfjsLib.getDocument({data: bytes}).promise, out = await PDFLib.PDFDocument.create();
  try{
    for(let i=1;i<=src.numPages;i++){
      if(o.onProgress) o.onProgress(i, src.numPages);
      const pg = await src.getPage(i), v1 = pg.getViewport({scale:1});
      const sc = Math.min(dpi/72, maxPx/Math.max(v1.width, v1.height)), vp = pg.getViewport({scale:sc});
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0,0,cv.width,cv.height);
      await pg.render({canvasContext:cx, viewport:vp, annotationMode:(pdfjsLib.AnnotationMode ? pdfjsLib.AnnotationMode.ENABLE : 1)}).promise;
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', o.quality || 0.88));
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      out.addPage([v1.width, v1.height]).drawImage(img, {x:0, y:0, width:v1.width, height:v1.height});
      cv.width = cv.height = 0; pg.cleanup();
    }
  } finally { await src.destroy(); }
  return out.save();
}

return {readAnnots, polyAngles, setPolySide, setPolyAngle, inPoly, areaNet, volumeM3, angleGeom, fmtNum, cloudPoly, polyLen, polyArea, fmtArea, stampBox, markerOps, rasterizePdf, dimLabels, setMeasure, fmtLen, prims, primsToSvg, textBox, bbox, buildPdf, PT_MM, FILLS, rectOps, circleOps, opsToD};
})();
if(typeof module !== 'undefined') module.exports = BladrCore;
