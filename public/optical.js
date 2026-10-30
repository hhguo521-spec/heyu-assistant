/* Scroll through a sequence of optical spaces. The images remain photographs;
   the travelling glass fragments are drawn independently above them. */
export function opticalScene(canvas, home) {
  const backgrounds = [...document.querySelectorAll('.scene-bg')];
  const prev = home.querySelector('[data-scene-prev]');
  const next = home.querySelector('[data-scene-next]');
  const announcement = document.querySelector('#announce');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const names = ['电蓝', '冰蓝', '幻紫', '翡翠绿'];
  const colours = [[135, 194, 255], [160, 221, 255], [209, 157, 255], [123, 234, 197]];
  const max = backgrounds.length - 1;
  const ctx = canvas && canvas.getContext('2d', {alpha:true});
  let active = true, position = 0, selected = 0, lastAnnounced = -1, scheduled = 0;
  const fragments = Array.from({length: 32}, (_, i) => ({
    angle: i * 2.39996 + Math.sin(i * 1.7) * .16,
    phase: ((i * .61803398875) % 1),
    width: .009 + (i % 5) * .004,
    length: .018 + (i % 4) * .012
  }));
  ['prism.jpg','scene-ice.png','scene-violet.png','scene-jade-v2.png'].forEach(src => {
    const img = new Image(); img.src = './' + src;
  });
  if (canvas) canvas.hidden = false;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };

  function drawPortal(from, t) {
    if (!ctx || !canvas) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const pw = Math.round(w * ratio), ph = Math.round(h * ratio);
    if (canvas.width !== pw || canvas.height !== ph) {canvas.width = pw; canvas.height = ph;}
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (reduced.matches || !active) return;
    const envelope = Math.pow(Math.sin(Math.PI * t), 1.2);
    if (envelope < .01) return;
    const cx = w * (w < 800 ? .62 : .72), cy = h * (w < 800 ? .31 : .47);
    const radius = Math.max(w, h), a = colours[from], b = colours[Math.min(from + 1, max)];
    const colour = a.map((n, i) => Math.round(n + (b[i] - n) * t)).join(',');

    // A brief shadow narrows the space around the vanishing point.
    const tunnel = ctx.createRadialGradient(cx,cy, radius*.025, cx,cy, radius*.68);
    tunnel.addColorStop(0, 'rgba(4,8,25,.04)');
    tunnel.addColorStop(.30, `rgba(6,10,26,${.12 * envelope})`);
    tunnel.addColorStop(1, `rgba(1,4,14,${.46 * envelope})`);
    ctx.fillStyle = tunnel; ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // Beveled transparent panels sweep past the camera, suggesting a tunnel
    // without drawing a wireframe over the photographic end frames.
    for (let i=0; i<9; i++) {
      const angle = i * Math.PI * 2 / 9 + .12;
      const nextAngle = angle + .36;
      const outer = radius * (1.0 + .24 * t), inner = radius * (.17 + .13 * t);
      const p = (r, a) => [cx + Math.cos(a)*r, cy + Math.sin(a)*r];
      const a=p(inner,angle), b=p(outer,angle-.05), c=p(outer,nextAngle), d=p(inner,nextAngle);
      const glass=ctx.createLinearGradient(a[0],a[1],b[0],b[1]);
      glass.addColorStop(0,'rgba(255,255,255,0)');
      glass.addColorStop(.55,`rgba(${colour},${.12*envelope})`);
      glass.addColorStop(.78,`rgba(240,250,255,${.36*envelope})`);
      glass.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=glass;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineTo(...c);ctx.lineTo(...d);ctx.closePath();ctx.fill();
    }
    // Narrow, fading streaks extend away from the vanishing point.
    for (let i=0; i<18; i++) {
      const angle = i * 2.39996 + .25;
      const start = radius * (.08 + ((i * .37 + t * .34) % .7));
      const end = start + radius * (.05 + .12 * envelope);
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const gradient = ctx.createLinearGradient(cx + ux*start, cy + uy*start, cx + ux*end, cy + uy*end);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(.65, `rgba(${colour},${.43 * envelope})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gradient; ctx.lineWidth = i % 4 === 0 ? 1.3 : .65;
      ctx.beginPath();ctx.moveTo(cx+ux*start,cy+uy*start);ctx.lineTo(cx+ux*end,cy+uy*end);ctx.stroke();
    }
    // Glass fragments move radially outwards as the viewer advances.
    fragments.forEach((f, i) => {
      const depth = (f.phase + t * .8) % 1;
      const distance = radius * (.025 + depth * depth * .82);
      const ux = Math.cos(f.angle), uy = Math.sin(f.angle);
      const x = cx + ux * distance, y = cy + uy * distance;
      const size = radius * f.width * (.2 + depth * 1.9);
      const len = radius * f.length * (.2 + depth * 1.6);
      const alpha = envelope * (1 - depth*.5) * (i % 3 === 0 ? .65 : .36);
      ctx.save();ctx.translate(x,y);ctx.rotate(f.angle);
      const fill = ctx.createLinearGradient(-len,0,len,0);
      fill.addColorStop(0,'rgba(255,255,255,0)');
      fill.addColorStop(.45,`rgba(${colour},${alpha})`);
      fill.addColorStop(.8,`rgba(255,255,255,${alpha*.7})`);
      fill.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(-len,-size*.45);ctx.lineTo(len,-size*.2);ctx.lineTo(len*.55,size*.56);ctx.lineTo(-len*.4,size*.34);ctx.closePath();ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }
  function paint(value) {
    position = clamp(value, 0, max);
    const from = Math.min(max - 1, Math.floor(position));
    const t = position >= max ? 1 : position - from;
    const fadeOut = 1 - smooth(t / .52);
    const fadeIn = smooth((t - .48) / .52);
    backgrounds.forEach((background, index) => {
      let opacity = 0, scale = 1;
      if (index === from) { opacity = reduced.matches ? 1 : fadeOut; scale = reduced.matches ? 1 : 1 + .90 * smooth(t); }
      if (index === from + 1) { opacity = reduced.matches ? smooth(t) : fadeIn; scale = reduced.matches ? 1 : 1.35 - .35 * smooth(t); }
      background.style.opacity = String(opacity);
      background.style.transform = `scale(${scale})`;
    });
    drawPortal(from, t);
    selected = Math.round(position);
    prev.disabled = selected <= 0; next.disabled = selected >= max;
    if (announcement && selected !== lastAnnounced) {announcement.textContent = names[selected] + '场景';lastAnnounced = selected;}
  }
  function fromScroll() {
    scheduled = 0;
    if (!active) return;
    const rect = home.getBoundingClientRect();
    const distance = Math.max(1, rect.height - innerHeight);
    paint(clamp(-rect.top / distance, 0, 1) * max);
  }
  function schedule() {if (active && !scheduled) scheduled = requestAnimationFrame(fromScroll);}
  function goTo(index) {
    const indexClamped = Math.round(clamp(index, 0, max));
    const rect = home.getBoundingClientRect();
    const top = window.scrollY + rect.top;
    const distance = Math.max(0, rect.height - innerHeight);
    window.scrollTo({top: top + distance * indexClamped / max, behavior: reduced.matches ? 'auto' : 'smooth'});
  }
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  prev.addEventListener('click', () => goTo(selected - 1));
  next.addEventListener('click', () => goTo(selected + 1));
  window.addEventListener('keydown', event => {
    if (!active || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); goTo(selected + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  reduced.addEventListener('change', schedule);
  paint(0);schedule();
  return { setHome(on) {
    active = on;
    if (!on) {
      cancelAnimationFrame(scheduled); scheduled = 0;
      if (ctx && canvas) ctx.clearRect(0,0,canvas.width,canvas.height);
    } else schedule();
  }};
}
