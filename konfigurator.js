/* Local-only configurator. No analytics, cookies, remote form submission or draft storage. */
(function(){
  'use strict';
  const C=window.HoammadeConfig;
  if(!C)return;
  const $=id=>document.getElementById(id);
  const form=$('config-form');
  const states=Object.fromEntries(Object.keys(C.products).map(key=>[key,C.initial()]));
  const touched=Object.fromEntries(Object.keys(C.products).map(key=>[key,new Set()]));
  const queryProduct=new URLSearchParams(location.search).get('produkt');
  let product=Object.hasOwn(C.products,queryProduct)?queryProduct:'glupperl';
  let submitted=false;
  let readyRequest=null;
  let lastDialogTrigger=null;
  const fieldIds={text:'personal-text',names:'personal-names',subline:'personal-subline',quantity:'quantity',date:'wish-date',notes:'notes'};
  const paths={"herz":"m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15","stern":"M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z"};
  const layout={
    glupperl:{x:940,y:487,width:585,size:86,mx:383,my:487,ms:60},
    untersetzer:{x:768,y:500,width:580,size:104,mx:768,my:620,ms:82},
    glasanhaenger:{x:890,y:518,width:545,size:100,mx:890,my:600,ms:65}
  };
  function state(){return states[product];}
  function announce(message){$('copy-status').textContent=message;}
  function setError(key,message){
    const field=$(fieldIds[key]);const error=$(key+'-error');
    if(!field||!error)return;
    error.textContent=message||'';error.hidden=!message;
    if(message)field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');
  }
  function markAndRender(key){touched[product].add(key);render();}
  function fitText(element,text,x,y,size,maxWidth){
    element.textContent=text;element.setAttribute('x',x);element.setAttribute('y',y);
    element.setAttribute('font-size',size);element.style.fontSize=size+'px';
    element.removeAttribute('textLength');element.removeAttribute('lengthAdjust');
    const f=C.fonts[state().font];element.style.fontFamily=f.family;element.style.fontStyle=f.style;
    const measured=element.getComputedTextLength();
    if(measured>maxWidth&&measured>0)element.style.fontSize=(size*maxWidth/measured)+'px';
  }
  function previewName(){
    const list=C.names(state());
    return list.length?C.displayText(list[Math.min(state().previewIndex,list.length-1)],state()):'Dein Name';
  }
  function renderPreview(){
    const s=state(),p=C.products[product],l=layout[product],hasMotif=s.motif!=='ohne';
    let nameY=l.y;
    if(product==='untersetzer'&&(hasMotif||C.normalize(s.subline)))nameY=440;
    if(product==='glasanhaenger'&&hasMotif)nameY=475;
    fitText($('preview-name'),previewName(),l.x,nameY,l.size,l.width);
    const subtitle=p.subline?C.displayText(s.subline,s):'';
    fitText($('preview-subline'),subtitle,768,535,52,530);
    $('preview-subline').hidden=!subtitle;
    $('preview-motif').style.display=hasMotif?'':'none';
    if(hasMotif){
      $('motif-path').setAttribute('d',paths[s.motif]);
      $('preview-motif').setAttribute('transform','translate('+(l.mx-l.ms/2)+' '+(l.my-l.ms/2)+') scale('+(l.ms/16)+')');
    }
    $('preview-photo').setAttribute('href',p.image);
    $('preview-accessible-title').textContent=p.label+' mit '+previewName()+', Schrift '+C.fonts[s.font].label+', '+C.motifs[s.motif]+(subtitle?', zweite Zeile '+subtitle:'');
  }
  function render(){
    const s=state(),p=C.products[product],list=C.names(s);
    $('text-count').textContent=C.length(C.displayText(s.text,s))+' / '+p.max;
    $('subline-count').textContent=C.length(C.displayText(s.subline,s))+' / 30';
    $('names-count').textContent=list.length+(list.length===1?' Name':' Namen');
    $('text-hint').textContent='Bis zu '+p.max+' Zeichen. '+(s.uppercase?'Die Vorschau zeigt Großbuchstaben.':'Groß- und Kleinschreibung bleibt erhalten.');
    $('names-hint').textContent='Ein Name pro Zeile, bis zu 50 Namen mit je '+p.max+' Zeichen. Schrift und Motiv gelten für alle.';
    const group=s.mode==='gruppe';
    $('single-field').hidden=group;$('personal-text').disabled=group;
    $('group-field').hidden=!group;$('personal-names').disabled=!group;
    $('subline-field').hidden=!p.subline;$('personal-subline').disabled=!p.subline;
    $('quantity-label').textContent=group?'Anzahl je Name':'Anzahl';
    $('quantity-hint').textContent=group?(list.length+' Namen × '+(s.quantity||'…')+' Stück.'):'Mit demselben Wunschtext.';
    const total=C.total(s);
    $('quantity-summary').textContent=total?total+' × '+p.label:'Dein '+p.singular;
    $('quantity-minus').disabled=Number(s.quantity)<=1;
    $('quantity-plus').disabled=Number(s.quantity)>=999;
    $('preview-names-control').hidden=!group||list.length===0;
    const options=list.slice(0,50).map((name,index)=>{
      const o=document.createElement('option');o.value=String(index);o.textContent=(index+1)+'. '+C.displayText(name,s);return o;
    });
    $('preview-person').replaceChildren(...options);
    s.previewIndex=Math.max(0,Math.min(s.previewIndex,list.length-1));
    $('preview-person').value=String(s.previewIndex);
    const errors=C.validate(product,s);
    for(const key of Object.keys(fieldIds))setError(key,(submitted||touched[product].has(key))?errors[key]:'');
    $('form-error').hidden=!submitted||Object.keys(errors).length===0;
    $('form-error').textContent='Bitte prüfe die markierten Felder. Dein Entwurf bleibt erhalten.';
    renderPreview();
  }
  function syncFields(){
    const s=state(),p=C.products[product];
    for(const [key,id] of Object.entries(fieldIds))$(id).value=s[key];
    $('uppercase').checked=s.uppercase;
    const groupNames={produkt:product,modus:s.mode,schrift:s.font,motiv:s.motif};
    for(const [group,value] of Object.entries(groupNames)){
      document.querySelectorAll('input[name="'+group+'"]').forEach(el=>{el.checked=el.value===value;});
    }
    $('preview-heading').textContent='Dein '+p.singular+'.';
    $('product-subtitle').textContent=p.subtitle;
    document.title=p.label+' gestalten — HOAMMADE';
    render();
  }
  function changeProduct(key){
    if(!Object.hasOwn(C.products,key))return;
    product=key;submitted=false;readyRequest=null;
    const u=new URL(location.href);u.searchParams.set('produkt',product);history.replaceState(null,'',u);
    syncFields();
  }
  function openDialog(dialog,trigger){
    lastDialogTrigger=trigger||document.activeElement;
    dialog.showModal();document.body.classList.add('dialog-open');
  }
  function showZoom(trigger){
    const clone=$('product-preview').cloneNode(true);
    clone.removeAttribute('id');clone.removeAttribute('aria-labelledby');
    clone.setAttribute('aria-label',$('preview-accessible-title').textContent);
    clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    $('zoom-content').replaceChildren(clone);
    openDialog($('zoom-dialog'),trigger);
  }
  function addDetail(label,value){
    if(!value)return;
    const term=document.createElement('dt'),detail=document.createElement('dd');
    term.textContent=label;detail.textContent=value;
    $('summary-details').append(term,detail);
  }
  function review(){
    submitted=true;render();
    const errors=C.validate(product,state());
    if(Object.keys(errors).length){
      const key=Object.keys(errors).find(k=>fieldIds[k]);
      if(key){
        if(key==='date'||key==='notes')$('extras').open=true;
        $(fieldIds[key]).focus();$(fieldIds[key]).scrollIntoView({block:'center',behavior:'auto'});
      }
      return;
    }
    const s=state(),p=C.products[product];readyRequest=C.request(product,s);
    $('summary-product').textContent=p.label;
    $('summary-total').textContent=readyRequest.total+' Stück';
    $('summary-names').replaceChildren(...C.names(s).map(name=>{
      const item=document.createElement('span');item.textContent=s.quantity+' × '+C.displayText(name,s);return item;
    }));
    $('summary-details').replaceChildren();
    addDetail('Schrift',C.fonts[s.font].label);addDetail('Motiv',C.motifs[s.motif]);
    addDetail('Schreibweise',s.uppercase?'Großbuchstaben':'Wie eingegeben');
    if(p.subline)addDetail('Zweite Zeile',C.displayText(s.subline,s));
    addDetail('Wunschtermin',readyRequest.formattedDate);addDetail('Anmerkung',C.normalize(s.notes));
    $('long-request-note').hidden=!readyRequest.long;
    $('email-request').href=readyRequest.href;
    $('request-text').value=readyRequest.body;$('manual-copy').hidden=true;announce('');
    openDialog($('request-dialog'),document.activeElement);
  }
  async function copy(){
    if(!readyRequest)return;
    try{
      if(!navigator.clipboard||!window.isSecureContext)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(readyRequest.body);
      announce('Der vollständige Anfragetext wurde kopiert.');
    }catch(e){
      $('manual-copy').hidden=false;$('request-text').focus();$('request-text').select();
      announce('Bitte kopiere den markierten Text oder nutze den Download.');
    }
  }
  function download(){
    if(!readyRequest)return;
    const blob=new Blob([readyRequest.body],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='HOAMMADE-Anfrage-'+product+'.txt';document.body.append(a);a.click();a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),2000);
    announce('Die Textdatei wurde zum Download bereitgestellt.');
  }
  function step(amount){
    const s=state();const current=/^[1-9]\d{0,2}$/.test(s.quantity)?Number(s.quantity):1;
    s.quantity=String(Math.max(1,Math.min(999,current+amount)));$('quantity').value=s.quantity;markAndRender('quantity');
  }
  for(const [key,id] of Object.entries(fieldIds)){
    $(id).addEventListener('input',e=>{state()[key]=e.target.value;markAndRender(key);});
    $(id).addEventListener('blur',()=>markAndRender(key));
  }
  document.querySelectorAll('input[name="produkt"]').forEach(el=>el.addEventListener('change',()=>changeProduct(el.value)));
  const radioMap={modus:'mode',schrift:'font',motiv:'motif'};
  for(const [name,key] of Object.entries(radioMap)){
    document.querySelectorAll('input[name="'+name+'"]').forEach(el=>el.addEventListener('change',()=>{
      state()[key]=el.value;state().previewIndex=0;render();
    }));
  }
  $('uppercase').addEventListener('change',e=>{state().uppercase=e.target.checked;render();});
  $('preview-person').addEventListener('change',e=>{state().previewIndex=Number(e.target.value);renderPreview();});
  $('quantity-minus').addEventListener('click',()=>step(-1));$('quantity-plus').addEventListener('click',()=>step(1));
  $('zoom-preview').addEventListener('click',e=>showZoom(e.currentTarget));$('mobile-preview').addEventListener('click',e=>showZoom(e.currentTarget));
  form.addEventListener('submit',e=>{e.preventDefault();review();});
  $('copy-request').addEventListener('click',copy);$('download-request').addEventListener('click',download);
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.addEventListener('close',()=>{
      document.body.classList.remove('dialog-open');
      if(lastDialogTrigger&&document.contains(lastDialogTrigger))lastDialogTrigger.focus();
    });
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const r=dialog.getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
    });
  });
  $('wish-date').min=C.today();
  window.addEventListener('focus',()=>{$('wish-date').min=C.today();});
  form.hidden=false;$('load-error').hidden=true;
  syncFields();
})();
