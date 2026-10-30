/* Subtle, non-blocking light interactions for the optical installations. */
export function initOpticalInteraction(canvas, root, home) {
  if (!canvas || !root || !home) return;
  const ctx = canvas.getContext('2d', {alpha:true});
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const point = {x:0, y:0, tx:0, ty:0, alpha:0, goal:0};
  const ripples = [];
  let width = 0, height = 0, dpr = 1, frame = 0, touch = null, last = 0;
  const visible = () => !home.hidden && !root.classList.contains('is-studio') && !document.hidden && !reduced.matches;
  const onArtwork = (x, y) => width < 800 ? y < height * .58 : x > width * .43;
  function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  function stop() { cancelAnimationFrame(frame); frame = 0; last = 0; ripples.length = 0; point.alpha = 0; point.goal = 0; clear(); }
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.max(1, Math.round(width*dpr)); canvas.height = Math.max(1, Math.round(height*dpr));
    if (visible() && (point.goal || ripples.length)) start();
  }
  function start() { if (!frame && visible()) {last = 0; frame = requestAnimationFrame(draw);} }
  function draw(now) {
    frame = 0;
    if (!visible()) {stop(); return;}
    const dt = Math.min((now - (last || now))/16.67, 3); last = now;
    const ease = 1-Math.pow(.88,dt || 1);
    point.x += (point.tx-point.x)*ease; point.y += (point.ty-point.y)*ease;
    point.alpha += (point.goal-point.alpha)*ease;
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);
    ctx.save();
    // Limit reflected light to the artwork, away from copy and controls.
    ctx.beginPath();
    if (width < 800) ctx.rect(0,0,width,height*.58);
    else ctx.rect(width*.43,0,width*.57,height);
    ctx.clip(); ctx.globalCompositeOperation = 'screen';
    if (point.alpha > .005) {
      const radius = Math.min(width,height)*.20;
      const halo = ctx.createRadialGradient(point.x,point.y,0,point.x,point.y,radius);
      halo.addColorStop(0,`rgba(205,236,255,${.12*point.alpha})`);
      halo.addColorStop(.28,`rgba(117,181,255,${.07*point.alpha})`);
      halo.addColorStop(1,'rgba(122,185,255,0)');
      ctx.fillStyle=halo; ctx.fillRect(point.x-radius,point.y-radius,radius*2,radius*2);
      // A fine glint makes motion visible without pretending the image is 3D.
      const glint=ctx.createLinearGradient(point.x-radius*.65,point.y+radius*.65,point.x+radius*.65,point.y-radius*.65);
      glint.addColorStop(0,'rgba(255,255,255,0)'); glint.addColorStop(.5,`rgba(228,247,255,${.30*point.alpha})`); glint.addColorStop(1,'rgba(255,255,255,0)');
      ctx.strokeStyle=glint; ctx.lineWidth=1; ctx.beginPath();ctx.moveTo(point.x-radius*.6,point.y+radius*.6);ctx.lineTo(point.x+radius*.6,point.y-radius*.6);ctx.stroke();
    }
    for (let i=ripples.length-1;i>=0;i--) {
      const r=ripples[i], t=(now-r.started)/1050;
      if (t>=1) {ripples.splice(i,1);continue;}
      const fade=(1-t)*(1-t), radius=12+t*Math.min(width,height)*.12;
      ctx.lineWidth=1;ctx.strokeStyle=`rgba(213,238,255,${.55*fade})`;
      ctx.beginPath();ctx.arc(r.x,r.y,radius,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(168,211,255,${.2*fade})`;ctx.beginPath();ctx.arc(r.x,r.y,radius*.72,0,Math.PI*2);ctx.stroke();
      for(let j=0;j<8;j++){
        const a=j*Math.PI/4+.24, dist=radius*(.54+(j%3)*.12), px=r.x+Math.cos(a)*dist, py=r.y+Math.sin(a)*dist;
        ctx.fillStyle=`rgba(228,248,255,${.7*fade})`;ctx.beginPath();ctx.arc(px,py,1.1*(1-t)+.25,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
    if (point.alpha > .005 || point.goal || ripples.length) frame=requestAnimationFrame(draw);
    else {last=0;clear();}
  }
  function move(e) {
    if (!visible() || e.pointerType === 'touch') return;
    if (onArtwork(e.clientX,e.clientY) && !e.target.closest('button,a,input,select,textarea')) {
      point.tx=e.clientX;point.ty=e.clientY;
      if (!point.alpha) {point.x=point.tx;point.y=point.ty;}
      point.goal=1;
    } else point.goal=0;
    start();
  }
  function down(e) {
    if (!visible() || !onArtwork(e.clientX,e.clientY) || e.target.closest('button,a,input,select,textarea')) return;
    touch = {id:e.pointerId,x:e.clientX,y:e.clientY,at:performance.now()};
  }
  function up(e) {
    if (!touch || touch.id !== e.pointerId) return;
    const p=touch;touch=null;
    if (!visible() || Math.hypot(e.clientX-p.x,e.clientY-p.y)>14 || performance.now()-p.at>500) return;
    ripples.push({x:e.clientX,y:e.clientY,started:performance.now()});
    if (ripples.length>3) ripples.shift();
    start();
  }
  function leave() { point.goal=0;touch=null;start(); }
  function visibility() {if (!visible()) stop();}
  window.addEventListener('pointermove',move,{passive:true});
  window.addEventListener('pointerdown',down,{passive:true});
  window.addEventListener('pointerup',up,{passive:true});
  window.addEventListener('pointercancel',leave,{passive:true});
  document.addEventListener('pointerout',e=>{if(!e.relatedTarget)leave();},{passive:true});
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('resize',resize,{passive:true});
  reduced.addEventListener('change',visibility);
  new MutationObserver(visibility).observe(root,{attributes:true,attributeFilter:['class']});
  resize();
}
