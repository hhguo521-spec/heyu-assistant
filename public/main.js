import {initStudioJourney} from './studio-journey.js?v=2';
import {opticalScene} from './optical.js?v=6';
import {initOpticalInteraction} from './interaction.js?v=1';
const root=document.querySelector('#experience'),home=document.querySelector('.home'),studio=document.querySelector('.studio'),announcement=document.querySelector('#announce');
const optical=opticalScene(document.querySelector('#optical'),home,root);
initOpticalInteraction(document.querySelector('#interactive-light'),root,home);
const reduce=matchMedia('(prefers-reduced-motion: reduce)');let mode='home',busy=false;
function navigate(to){if(busy||to===mode)return;busy=true;root.classList.add('transition');setTimeout(()=>{mode=to;home.hidden=to!=='home';studio.hidden=to!=='studio';root.classList.toggle('is-studio',to==='studio');document.title=to==='home'?'禾予 · 光学实验室':'创作空间 · 禾予';window.scrollTo(0,0);optical.setHome(to==='home');if(to==='studio')document.querySelector('#studio-heading').focus({preventScroll:true});root.classList.remove('transition');busy=false},reduce.matches?0:480)}
document.querySelectorAll('[data-enter]').forEach(b=>b.addEventListener('click',()=>navigate('studio')));document.querySelectorAll('[data-home]').forEach(b=>b.addEventListener('click',()=>navigate('home')));
initStudioJourney(announcement);
