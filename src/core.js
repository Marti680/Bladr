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
  out.push({k:'path', ops:[['M',...p[0]],['L',...p[1]],['L',...p[2]],['L',...p[3]],['Z']], stroke:null, fill:'#ffffff'});
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
  } else if(a.type==='angle' && a.pts && a.pts.length === 6){
    const g = angleGeom(a), o = off(a.lo);
    L.push({key:'lo', str:fmtNum(g.deg,1)+'°', x:g.vx+g.bx*(g.r+s*1.3)+o.x, y:g.vy+g.by*(g.r+s*1.3)+o.y, rot:0, size:s});
  } else if(a.type==='circle' && a.showDim){
    const g = s*0.65 + 3, o = off(a.lo);
    if(a.dimKind==='r') L.push({key:'lo', str:'R '+F(a.r), x:a.cx+a.r/2+o.x, y:a.cy-g+o.y, rot:0, size:s});
    else L.push({key:'lo', str:'Ø '+F(2*a.r), x:a.cx+o.x, y:a.cy-g+o.y, rot:0, size:s});
  }
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
  if(opts.mode === 'ocg'){
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
  for(let i=0;i<pages.length;i++){
    const groups = opts.layers.map(l => ({l, as: opts.annotsFor(i, l.id)})).filter(g => g.as.length);
    if(!groups.length) continue;
    const pg = pages[i], node = pg.node; node.normalize();
    const info = opts.pageInfo(i);
    const fontKey = node.newFontDictionary('BladrHelv', font.ref), fontKeyB = node.newFontDictionary('BladrHelvB', fontB.ref), gsKey = node.newExtGState('BladrGS', gsRef);
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
      g.as.forEach(a => prims(a, info).forEach(p => {
        if(p.k === 'image'){
          const nm = node.newXObject('BladrImg', imgs[p.src].ref);
          ops.push(L.pushGraphicsState(), L.concatTransformationMatrix(p.w,0,0,-p.h,p.x,p.y+p.h), L.drawObject(nm), L.popGraphicsState());
          return;
        }
        if(p.k === 'text'){
          ops.push(L.pushGraphicsState(), L.setFillingRgbColor(...hexRgb(p.color)), L.beginText(), L.setFontAndSize(p.bold ? fontKeyB : fontKey, p.size),
            L.setTextMatrix(Math.cos(p.rot||0),Math.sin(p.rot||0),Math.sin(p.rot||0),-Math.cos(p.rot||0),p.x,p.y), L.showText((p.bold ? fontB : font).encodeText(clean(p.str))), L.endText(), L.popGraphicsState());
          return;
        }
        ops.push(L.pushGraphicsState());
        if(p.stroke){ ops.push(L.setStrokingRgbColor(...hexRgb(p.stroke)), L.setLineWidth(p.width), L.setLineCap(p.cap ? L.LineCapStyle.Round : L.LineCapStyle.Butt), L.setDashPattern(p.dash || [], 0)); }
        if(p.fill) ops.push(L.setFillingRgbColor(...hexRgb(p.fill)));
        if(p.fill && p.op && p.op < 1) ops.push(L.setGraphicsState(gsKey));
        p.ops.forEach(o => {
          if(o[0]==='M') ops.push(L.moveTo(o[1],o[2])); else if(o[0]==='L') ops.push(L.lineTo(o[1],o[2]));
          else if(o[0]==='C') ops.push(L.appendBezierCurve(o[1],o[2],o[3],o[4],o[5],o[6])); else ops.push(L.closePath());
        });
        ops.push(p.evenOdd && p.fill ? PDFOperator.of(p.stroke ? 'B*' : 'f*', []) : p.fill && p.stroke ? L.fillAndStroke() : p.fill ? L.fill() : L.stroke());
        ops.push(L.popGraphicsState());
      }));
      if(ocg[g.l.id]) ops.push(PDFOperator.of('EMC', []));
    });
    ops.push(L.popGraphicsState());
    pg.pushOperators(...ops);
  }
  return await pdf.save();
  } finally { measureFn = prevMeasure; }
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

return {areaNet, volumeM3, angleGeom, fmtNum, cloudPoly, polyLen, polyArea, fmtArea, stampBox, markerOps, rasterizePdf, dimLabels, setMeasure, fmtLen, prims, primsToSvg, textBox, bbox, buildPdf, PT_MM, FILLS, rectOps, circleOps, opsToD};
})();
if(typeof module !== 'undefined') module.exports = BladrCore;
