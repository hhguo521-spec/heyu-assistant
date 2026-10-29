const root = document.getElementById('heyu-liquid-letters');
function route(){
  if (location.hash && !['#home', '#create'].includes(location.hash)) return;
  const create = location.hash === '#create';
  root.querySelector('.home').hidden = create;
  root.querySelector('.creation').hidden = !create;
  document.title = create ? '创作空间 · 禾予' : '禾予 · 种草助手';
  if(create){window.scrollTo(0,0);root.querySelector('#create-heading').focus({preventScroll:true});}
  else if(location.hash === '#home') window.scrollTo(0,0);
}
root.querySelectorAll('[data-enter]').forEach(button=>button.addEventListener('click',()=>{if(location.hash === '#create') route();else location.hash='#create';}));
root.querySelectorAll('[data-home]').forEach(button=>button.addEventListener('click',()=>{if(location.hash === '#home') route();else location.hash='#home';}));
window.addEventListener('hashchange',route);
route();
const want = document.getElementById('want');
function updateWant(){
  const video=want.value.includes('视频');
  document.getElementById('shot-field').hidden=!video;
  document.getElementById('shot').disabled=!video;
  document.getElementById('want-hint').textContent = video ? '将生成文案、配图和视频。' : want.value.includes('配图') ? '将生成文案和配图。' : '将生成文案，不生成配图或视频。';
}
want.addEventListener('change',updateWant);updateWant();
