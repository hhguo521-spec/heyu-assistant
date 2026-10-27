
(()=>{
const root=document.getElementById('heyu-liquid-letters'),canvas=root.querySelector('canvas'),stage=root.querySelector('.l-canvaswrap'),status=root.querySelector('[role=status]'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
const opts={flow:1,material:'液态银',shape:'H',opacity:60,playing:!reduce.matches};let sceneVisible=true,pageHome=true,raf=0,elapsed=0,last=0,spin=0,tilt=0,drag=false,lastX=0,lastY=0,travel=0,pointer=[0,0],smoothPointer=[0,0],hover=0,hoverTarget=0,ripple=-20;
let saved=null;try{saved=JSON.parse(localStorage.getItem('heyu-visual-preferences')||'null');}catch{}
if(saved&&['液态银','极光'].includes(saved.material))opts.material=saved.material;
if(saved&&['H','Y'].includes(saved.shape))opts.shape=saved.shape;
function save(){try{localStorage.setItem('heyu-visual-preferences',JSON.stringify({material:opts.material,shape:opts.shape}));}catch{}}
function labels(){canvas.style.opacity=String(opts.opacity/100);root.querySelector('.l-object-note b').textContent='Fluid / '+opts.shape;root.querySelector('.l-orb-fallback').textContent=opts.shape;root.querySelectorAll('[data-shape]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shape===opts.shape)));root.querySelector('[data-material-name]').textContent=opts.material;root.querySelector('[data-pause]').textContent=opts.playing?'Ⅱ 暂停':'▷ 播放';root.querySelector('[data-pause]').setAttribute('aria-pressed',String(!opts.playing));}
const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});let program,loc={},indexCount;
const meshCache=new Map();let positionBuffer,normalBuffer;
function field(x,y,z,letter){
 const paths=letter==='H'?[
 [-.65,-.91,.04,-.72,-.16,.02,.26,.32],[-.72,-.16,.02,-.55,.86,-.04,.32,.26],
 [.56,-.84,-.04,.65,.15,.04,.31,.26],[.65,.15,.04,.49,.94,.02,.26,.30],
 [-.66,.02,.03,-.12,.13,.09,.23,.28],[-.12,.13,.09,.60,-.05,.04,.28,.22]
 ]:[
 [-.68,.90,.01,-.43,.49,-.01,.30,.28],[-.43,.49,-.01,.02,.05,.05,.28,.30],
 [.67,.91,-.04,.49,.49,.02,.25,.29],[.49,.49,.02,.02,.05,.05,.29,.30],
 [.02,.05,.05,.06,-.43,.01,.29,.28],[.06,-.43,.01,-.15,-.94,.04,.28,.32]
 ];
 let d=10;
 for(const s of paths){const ax=x-s[0],ay=y-s[1],az=z-s[2],bx=s[3]-s[0],by=s[4]-s[1],bz=s[5]-s[2];const h=Math.max(0,Math.min(1,(ax*bx+ay*by+az*bz)/(bx*bx+by*by+bz*bz)));let q=Math.hypot(ax-bx*h,ay-by*h,az-bz*h)-(s[6]+(s[7]-s[6])*h);const k=.18,a=Math.max(k-Math.abs(d-q),0)/k;d=Math.min(d,q)-a*a*k*.25;}
 return d;
}
function buildLetter(letter){
 const nx=40,ny=46,nz=22,dx=2.7/nx,dy=3.0/ny,dz=1.4/nz;
 const points=[],values=[],positions=[],normals=[];
 const idx=(x,y,z)=>(z*(ny+1)+y)*(nx+1)+x;
 for(let z=0;z<=nz;z++)for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const p=[-1.35+x*dx,-1.5+y*dy,-.7+z*dz];points.push(p);values.push(field(...p,letter));}
 function vertex(a,b){const t=values[a]/(values[a]-values[b]),p=points[a],q=points[b];return p.map((v,i)=>v+(q[i]-v)*t);}
 function add(p){positions.push(...p);const [x,y,z]=p,e=.002;let a=field(x+e,y,z,letter)-field(x-e,y,z,letter),b=field(x,y+e,z,letter)-field(x,y-e,z,letter),c=field(x,y,z+e,letter)-field(x,y,z-e,letter),len=Math.hypot(a,b,c)||1;normals.push(a/len,b/len,c/len);}
 const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
 const c=[idx(x,y,z),idx(x+1,y,z),idx(x+1,y+1,z),idx(x,y+1,z),idx(x,y,z+1),idx(x+1,y,z+1),idx(x+1,y+1,z+1),idx(x,y+1,z+1)];
 if(c.every(i=>values[i]>=0)||c.every(i=>values[i]<0))continue;
 for(const t of tets){const inside=t.map(i=>c[i]).filter(i=>values[i]<0),outside=t.map(i=>c[i]).filter(i=>values[i]>=0);if(!inside.length||!outside.length)continue;
 if(inside.length===1){outside.forEach(i=>add(vertex(inside[0],i)));}else if(inside.length===3){inside.forEach(i=>add(vertex(outside[0],i)));}else{const a=vertex(inside[0],outside[0]),b=vertex(inside[0],outside[1]),c2=vertex(inside[1],outside[0]),d=vertex(inside[1],outside[1]);[a,b,c2,b,d,c2].forEach(add);}}
 }
 return {positions:new Float32Array(positions),normals:new Float32Array(normals)};
}
function setMesh(){if(!program)return;if(!meshCache.has(opts.shape))meshCache.set(opts.shape,buildLetter(opts.shape));const m=meshCache.get(opts.shape);indexCount=m.positions.length/3;
 gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);gl.bufferData(gl.ARRAY_BUFFER,m.positions,gl.STATIC_DRAW);const a=gl.getAttribLocation(program,'aPos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,0,0);
 gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffer);gl.bufferData(gl.ARRAY_BUFFER,m.normals,gl.STATIC_DRAW);const n=gl.getAttribLocation(program,'aNormal');gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,3,gl.FLOAT,false,0,0);
}

function fallback(){canvas.hidden=true;root.querySelector('.l-orb-fallback').hidden=false;status.textContent='此环境未启用三维渲染，显示静态材质预览。';}
if(gl){try{
const vs=`precision highp float;
attribute vec3 aPos,aNormal;uniform float uTime,uSpin,uTilt,uHover,uRipple,uFlow,uAspect;uniform vec2 uPointer;varying vec3 vNormal,vPos;
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
vec3 warp(vec3 p,vec3 n){float t=uTime*.5;float fluid=sin(p.x*4.+p.y*2.+t)*cos(p.y*3.2-t*.7)*cos(p.z*4.+t*.4);float fine=sin(p.y*8.+p.x*4.-t*1.5)*cos(p.z*6.+t);vec3 q=p+n*uFlow*(.065*fluid+.025*fine);q.x+=.045*sin(p.y*3.+t);q.z+=.05*sin(p.y*2.5+p.x*2.-t);float age=uTime-uRipple;float r=length(p.xy-uPointer);float wave=sin(r*12.-age*9.)*exp(-r*1.7)*exp(-age*1.4)*step(0.,age);q+=n*wave*.075;float influence=exp(-dot(p.xy-uPointer,p.xy-uPointer)*3.5)*smoothstep(-.1,.2,p.z);q.z+=influence*uHover*.19;return q;}
void main(){vec3 p=aPos,n=normalize(aNormal);vec3 tangent=normalize(cross(n,abs(n.y)>.95?vec3(1.,0.,0.):vec3(0.,1.,0.)));vec3 bitangent=cross(n,tangent);vec3 q=warp(p,n);vec3 a=warp(p+tangent*.008,n)-q;vec3 b=warp(p+bitangent*.008,n)-q;mat3 rot=rotY(uSpin+sin(uTime*.19)*.16)*rotX(uTilt+.08);vNormal=normalize(rot*normalize(cross(a,b)));vPos=rot*q;float z=4.4-vPos.z;gl_Position=vec4(vPos.x*3.25/uAspect,vPos.y*3.25,z-0.2,z);}`;
const fs=`precision highp float;uniform float uMaterial;varying vec3 vNormal,vPos;
float band(float x,float c,float w,float e){return 1.-smoothstep(w,w+e,abs(x-c));}
vec3 environment(vec3 r){vec3 col=mix(vec3(.012,.018,.022),vec3(.32,.4,.44),smoothstep(-.5,.8,r.y));float panel=band(r.x,-.37,.27,.045)*smoothstep(-.1,.15,r.y);col=mix(col,vec3(1.,1.,.97)*3.0,panel);float stripe=band(r.x,.52,.055,.025)*smoothstep(-.65,-.2,r.y);col=mix(col,vec3(.94,1.,.94)*3.8,stripe);float black=band(r.y,.1,.12,.07)*band(r.x,.1,.7,.1);col=mix(col,vec3(.006,.009,.012),black*.87);float lower=band(r.y,-.56,.07,.06);col+=vec3(.65,.72,.6)*lower*.65;col=mix(col,col*vec3(.65,.78,1.5),smoothstep(.45,1.,r.z)*.22);return col;}
void main(){vec3 n=normalize(vNormal);vec3 v=normalize(vec3(0.,0.,4.4)-vPos);vec3 r=reflect(-v,n);float nv=max(dot(n,v),0.);vec3 col=environment(r);float fres=pow(1.-nv,3.);vec3 tint=.55+.45*cos(vec3(0.,2.1,4.2)+nv*7.+vPos.y*1.4);col=mix(col,col*(.65+tint*.7)+tint*.07,uMaterial);col*=.76+.24*max(n.y,0.);col+=vec3(.18,.24,.2)*fres;float spec=pow(max(dot(n,normalize(vec3(-.8,1.2,2.))),0.),70.);col+=spec*.15;col=col/(col+.58);col=pow(col,vec3(.65))*1.12;gl_FragColor=vec4(col,1.);}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
positionBuffer=gl.createBuffer();normalBuffer=gl.createBuffer();setMesh();
for(const n of ['uTime','uSpin','uTilt','uHover','uRipple','uFlow','uAspect','uPointer','uMaterial'])loc[n]=gl.getUniformLocation(program,n);gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
}catch(e){console.error('Liquid preview:',e.message);program=null;fallback();}}else fallback();
function render(){if(!program)return;gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(loc.uTime,elapsed);gl.uniform1f(loc.uSpin,spin);gl.uniform1f(loc.uTilt,tilt);gl.uniform1f(loc.uHover,hover);gl.uniform1f(loc.uRipple,ripple);gl.uniform1f(loc.uFlow,opts.flow);gl.uniform1f(loc.uAspect,canvas.width/canvas.height);gl.uniform1f(loc.uMaterial,opts.material==='极光'?1:0);gl.uniform2f(loc.uPointer,...smoothPointer);gl.drawArrays(gl.TRIANGLES,0,indexCount);}
function size(){const r=stage.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);render();}new ResizeObserver(size).observe(stage);
function tick(now){raf=0;const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(opts.playing)elapsed+=dt;for(let i=0;i<2;i++)smoothPointer[i]+=(pointer[i]-smoothPointer[i])*.09;hover+=(hoverTarget-hover)*.09;render();if(opts.playing&&sceneVisible&&pageHome&&!document.hidden)raf=requestAnimationFrame(tick);}
function start(){if(!raf&&opts.playing&&sceneVisible&&pageHome&&!document.hidden){last=0;raf=requestAnimationFrame(tick);}}function stop(){cancelAnimationFrame(raf);raf=0;last=0;}
function interact(e){const r=canvas.getBoundingClientRect();pointer=[(e.clientX-r.left-r.width/2)/r.height*2.5,-(e.clientY-r.top-r.height/2)/r.height*2.5];hoverTarget=1;if(drag){const dx=e.clientX-lastX,dy=e.clientY-lastY;spin+=dx*.009;tilt=Math.max(-1,Math.min(1,tilt+dy*.006));travel+=Math.abs(dx)+Math.abs(dy);lastX=e.clientX;lastY=e.clientY;}if(!opts.playing){smoothPointer=[...pointer];hover=1;render();}}
canvas.addEventListener('pointermove',interact);canvas.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;travel=0;canvas.setPointerCapture(e.pointerId);interact(e);});function pulse(){ripple=elapsed;if(!reduce.matches){opts.playing=true;labels();start();}else{spin+=.5;render();}status.textContent='已触发液态涟漪。';}
canvas.addEventListener('pointerup',e=>{if(travel<8)pulse();else status.textContent="模型已旋转。";drag=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});canvas.addEventListener('pointercancel',()=>{drag=false;hoverTarget=0;});canvas.addEventListener('pointerleave',()=>{hoverTarget=0;if(!opts.playing){hover=0;render();}});
root.querySelector('[data-ripple]').addEventListener('click',pulse);root.querySelector('[data-pause]').addEventListener('click',()=>{opts.playing=!opts.playing;labels();opts.playing?start():stop();save();});root.querySelector('[data-material]').addEventListener('click',()=>{opts.material=opts.material==='液态银'?'极光':'液态银';labels();render();save();});
root.querySelectorAll('[data-shape]').forEach(b=>b.addEventListener('click',()=>{opts.shape=b.dataset.shape;spin=0;tilt=0;setMesh();labels();render();status.textContent='已切换为液态 '+opts.shape+' 字形。';save();}));
function showHome(home){pageHome=home;root.querySelector('.l-home').hidden=!home;root.querySelector('.l-creation').hidden=home;document.title=home?'禾予 · 种草助手':'创作空间 · 禾予';if(home){size();start();}else stop();}
function route(){const home=location.hash!=='#create';showHome(home);window.scrollTo(0,0);if(!home)root.querySelector('#create-heading').focus({preventScroll:true});}
function navigate(home){const next=home?'#home':'#create';if(location.hash===next)route();else location.hash=next;}
root.querySelectorAll('[data-enter]').forEach(b=>b.addEventListener('click',()=>navigate(false)));
root.querySelector('.l-back').addEventListener('click',()=>navigate(true));root.querySelector('.l-brand').addEventListener('click',()=>navigate(true));window.addEventListener('hashchange',route);
new IntersectionObserver(([entry])=>{sceneVisible=entry.isIntersecting;sceneVisible?start():stop();},{threshold:.05}).observe(root);document.addEventListener('visibilitychange',()=>document.hidden?stop():start());reduce.addEventListener('change',()=>{if(reduce.matches){opts.playing=false;labels();stop();}});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stop();program=null;fallback();});labels();size();route();start();
})();
