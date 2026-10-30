import {MAX_WAIT, request, pollWorkflow, parseOutputs, safeMediaURL, textValue} from './workflow.js';

export function initStudioJourney(announcement){
  const q=s=>document.querySelector(s), all=s=>Array.from(document.querySelectorAll(s));
  const audience=q('#audience'), access=q('#access-code'), note=q('#form-note'), form=q('#form');
  const panels=all('[data-panel]'), steps=all('[data-goto]'), next=q('#next'), check=q('#check-result');
  let step=0, busy=false, lastId=null, lastWant='';
  function message(value='', error=false){note.textContent=value;note.classList.toggle('error',error)}
  function updateSummary(){
    const shot=q('#shot').value.trim();
    const values=[['商品',q('[name=product]:checked').value],['活动',q('#campaign').value.trim()||'未填写'],['目标人群',audience.value.trim()||'未填写'],['输出形式',q('[name=want]:checked').value]];
    if(q('[name=want]:checked').value.includes('视频'))values.push(['视频镜头要求',shot||'未填写']);
    const target=q('#summary');target.replaceChildren();
    for(const [key,value] of values){const box=document.createElement('div'),label=document.createElement('small'),content=document.createElement('strong');label.textContent=key;content.textContent=value;box.append(label,content);target.append(box)}
  }
  function go(index){
    if(busy)return;
    const target=Math.max(0,Math.min(3,index));
    if(target>1&&!audience.value.trim()){step=1;render();message('请先填写目标人群，才能继续。',true);audience.focus();return}
    step=target;message();render();
  }
  function render(){
    panels.forEach((p,i)=>{p.hidden=i!==step});
    steps.forEach((b,i)=>{b.classList.toggle('active',i===step);if(i===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')});
    q('#stepcount').textContent=String(step+1).padStart(2,'0')+' / 04';q('#prev').hidden=step===0;q('#next-label').textContent=step===3?'生成':'下一步';
    if(step===3)updateSummary();announcement.textContent=`第 ${step+1} 步，${['选择产品','想要打动谁','选择表达','确认并生成'][step]}`;
  }
  function setBusy(value){
    busy=value;form.setAttribute('aria-busy',String(value));
    form.querySelectorAll('input, textarea, button').forEach(node=>{node.disabled=value});
    steps.forEach(node=>{node.disabled=value});
  }
  // Every Dify value enters the page through textContent, never HTML parsing.
  function el(tag,cls,value){const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=textValue(value);return node}
  function card(title){const node=el('section','generated-card');node.append(el('h4','generated-title',title));return node}
  function mediaCard(type,value,description){
    const section=card(type==='image'?'配图':'视频'),url=safeMediaURL(value);
    if(!url){section.append(el('p','generated-body',value?'素材地址无效，请查看工作流运行记录。':'本次未返回素材。'));return section}
    const media=el(type==='image'?'img':'video','generated-media');
    if(type==='image'){media.alt='本次生成的商品种草配图';media.loading='lazy';media.referrerPolicy='no-referrer'}else{media.controls=true;media.playsInline=true;media.preload='metadata'}
    media.src=url;media.addEventListener('error',()=>{if(!section.querySelector('.generated-media-error'))section.append(el('p','generated-body generated-media-error','素材暂时无法加载，可以尝试打开原文件。'))});
    section.append(media);if(description)section.append(el('p','generated-body',description));
    const link=el('a','generated-link','打开原文件 ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';section.append(link);return section;
  }
  function renderResult(data){
    const result=parseOutputs(data.outputs),target=q('#results');target.replaceChildren();q('#empty-result').hidden=true;
    if(result.verdict==='转人工'){
      const c=card('转人工');c.append(el('p','generated-body',textValue(result.reason)||'工作流未提供原因，请查看 Dify 运行记录。'));target.append(c);return;
    }
    const status=el('p','generated-status','自动通过');target.append(status);
    if(result.error)target.append(el('p','generated-warning',result.error));
    const xhs=card('小红书笔记');xhs.append(el('h5','generated-subtitle',textValue(result.xhs?.title)||'未返回标题'),el('p','generated-body',textValue(result.xhs?.body)||'未返回正文。'));
    const tags=Array.isArray(result.xhs?.tags)?result.xhs.tags.map(textValue).filter(Boolean):textValue(result.xhs?.tags)?[textValue(result.xhs.tags)]:[];
    if(tags.length)xhs.append(el('p','generated-tags',tags.map(t=>t.startsWith('#')?t:`#${t}`).join(' ')));
    const dy=card('抖音口播');dy.append(el('p','generated-body',textValue(result.douyin?.script)||'未返回口播文案。'));
    const detail=card('详情页首屏');detail.append(el('h5','generated-subtitle',textValue(result.detail?.headline)||'未返回主标题'));
    const points=Array.isArray(result.detail?.points)?result.detail.points.slice(0,3).map(textValue):[];while(points.length<3)points.push('未返回该卖点。');
    const list=el('ol','generated-points');points.forEach(point=>list.append(el('li','',point)));detail.append(list,el('p','generated-price',textValue(result.detail?.price)||'未返回价格条。'));
    target.append(xhs,dy,detail);
    const media=el('div','generated-media-grid');if(lastWant.includes('配图')||result.image_url)media.append(mediaCard('image',result.image_url));if(lastWant.includes('视频')||result.video_url)media.append(mediaCard('video',result.video_url,textValue(result.video_desc)));if(media.childElementCount)target.append(media);
    if(result.rounds!==undefined)target.append(el('p','generated-meta',`审核轮次：${textValue(result.rounds)} · 工作流用时 ${Math.round(Number(data.elapsed)||0)} 秒`));
  }
  async function generate(){
    if(busy)return;
    if(!audience.value.trim()){go(1);message('请先填写目标人群。',true);audience.focus();return}
    if(Array.from(audience.value.trim()).length>60){go(1);message('目标人群最多填写 60 字。',true);audience.focus();return}
    if(Array.from(q('#shot').value).length>500){go(2);message('视频镜头要求最多填写 500 字。',true);q('#shot').focus();return}
    const code=access.value.trim();if(!code){go(2);message('请填写访问口令。',true);access.focus();return}
    const values=new FormData(form),inputs=Object.fromEntries(['product','campaign','audience','want','shot'].map(key=>[key,(values.get(key)??'').trim()]));
    if(!inputs.want.includes('视频'))inputs.shot='';
    lastId=null;lastWant=inputs.want;setBusy(true);message();q('#results').replaceChildren();q('#empty-result').hidden=true;q('#progress').hidden=false;q('#run-info').hidden=true;check.hidden=true;
    q('#progress-title').textContent='正在提交你的创作需求';q('#progress-detail').textContent='正在启动工作流，请稍候。';q('#elapsed').textContent='0';
    const started=Date.now(),controller=new AbortController(),deadline=started+MAX_WAIT;
    const cutoff=setTimeout(()=>controller.abort(new Error('已等待 6 分钟，已停止自动查询。任务可能仍在后台运行。')),MAX_WAIT);
    const ticker=setInterval(()=>{q('#elapsed').textContent=String(Math.min(360,Math.floor((Date.now()-started)/1000)))},1000);
    try{
      // Never automatically retry start: a timeout may already have created a paid task.
      const {id}=await request('/api/start',code,{method:'POST',body:inputs,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)])});
      if(typeof id!=='string'||!id)throw new Error('没有收到任务编号，请先查看 Dify 运行记录。');
      lastId=id;q('#run-info').hidden=false;q('#run-info').textContent=`任务编号：${id}（请勿刷新页面，以便稍后查询）`;
      q('#progress-title').textContent='灵感正在长成素材';q('#progress-detail').textContent='每 5 秒查询一次；图片和视频可能需要更久，最长等待 6 分钟。';
      const data=await pollWorkflow({id,code,deadline,signal:controller.signal,onRetry:()=>{q('#progress-detail').textContent='这次查询暂未成功，将继续查询，无需重复提交。'},onStatus:()=>{q('#progress-detail').textContent='工作流正在运行，每 5 秒查询一次，最长等待 6 分钟。'}});
      renderResult(data);
    }catch(error){
      message(error.name==='TimeoutError'?'启动请求超时，任务可能已提交。请先查看 Dify 运行记录，避免重复生成。':error.message||'网络暂时不可用，请稍后重试。',true);check.hidden=!lastId;
    }finally{clearInterval(ticker);clearTimeout(cutoff);controller.abort();q('#progress').hidden=true;setBusy(false)}
  }
  async function checkResult(){
    if(!lastId||busy)return;setBusy(true);message();
    try{const data=await request(`/api/status?id=${encodeURIComponent(lastId)}`,access.value.trim(),{signal:AbortSignal.timeout(18000)});
      if(data.status==='succeeded'){renderResult(data);check.hidden=true}
      else if(['failed','stopped','partial-succeeded'].includes(data.status))message(data.error||'任务未能完成，请查看 Dify 运行记录。',true);
      else message(data.status==='paused'?'工作流已暂停，请在 Dify 中完成所需操作。':'任务仍在后台运行，可以稍后再查。');
    }catch(error){message(error.message||'暂时无法查询，请稍后重试。',true)}finally{setBusy(false)}
  }
  form.addEventListener('submit',e=>e.preventDefault());
  next.addEventListener('click',()=>step===3?generate():go(step+1));q('#prev').addEventListener('click',()=>go(step-1));check.addEventListener('click',checkResult);
  steps.forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.goto))));
  audience.addEventListener('input',e=>q('#count').textContent=Array.from(e.target.value).length);
  q('#shot').addEventListener('input',e=>q('#shot-count').textContent=Array.from(e.target.value).length);
  all('[data-example]').forEach(b=>b.addEventListener('click',()=>{audience.value=b.dataset.example;audience.dispatchEvent(new Event('input'));audience.focus()}));
  all('[name=want]').forEach(b=>b.addEventListener('change',()=>{q('#shot-wrap').hidden=!q('[name=want]:checked').value.includes('视频')}));
  render();
}
