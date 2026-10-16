/* HOAMMADE configurator: pure data, validation and request formatting. */
(function(root,factory){
  if(typeof module === 'object' && module.exports) module.exports=factory();
  else root.HoammadeConfig=factory();
})(typeof globalThis !== 'undefined' ? globalThis : this,function(){
  'use strict';
  const products=Object.freeze({
    glupperl:{label:'Glupperl',singular:'Glupperl',max:18,subtitle:'Ein kleines Stück Tracht. Ganz persönlich.',image:'assets/konfigurator/glupperl.jpg',subline:false},
    untersetzer:{label:'Untersetzer',singular:'Untersetzer',max:24,subtitle:'Dein Platz am Tisch. Mit deiner Handschrift.',image:'assets/konfigurator/untersetzer.jpg',subline:true},
    glasanhaenger:{label:'Glasanhänger',singular:'Glasanhänger',max:18,subtitle:'Damit dein Glas auch deins bleibt.',image:'assets/konfigurator/glasanhaenger.jpg',subline:false}
  });
  const fonts=Object.freeze({
    klassisch:{label:'Klassisch',family:'Georgia, "Times New Roman", serif',style:'normal'},
    klar:{label:'Klar',family:'Arial, Helvetica, sans-serif',style:'normal'},
    elegant:{label:'Elegant',family:'Georgia, "Times New Roman", serif',style:'italic'}
  });
  const motifs=Object.freeze({ohne:'Ohne Motiv',herz:'Herz',stern:'Stern'});
  const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('de',{granularity:'grapheme'}):null;
  function chars(value){ return segmenter ? Array.from(segmenter.segment(String(value)),s=>s.segment) : Array.from(String(value)); }
  function length(value){return chars(value).length;}
  function normalize(value){return String(value || '').normalize('NFC').trim();}
  function initial(){return {mode:'einzeln',text:'',names:'',subline:'',font:'klassisch',motif:'ohne',uppercase:false,quantity:'1',date:'',notes:'',previewIndex:0};}
  function names(state){return state.mode==='gruppe' ? String(state.names).split(/\r?\n/).map(normalize).filter(Boolean) : (normalize(state.text)?[normalize(state.text)]:[]);}
  function displayText(text,state){return state.uppercase ? normalize(text).toLocaleUpperCase('de-DE') : normalize(text);}
  function today(date){const d=date||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function validDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const a=value.split('-').map(Number);const d=new Date(a[0],a[1]-1,a[2]);
    return d.getFullYear()===a[0]&&d.getMonth()===a[1]-1&&d.getDate()===a[2];
  }
  function total(state){const q=Number(state.quantity);return Number.isInteger(q)&&q>=1&&q<=999?names(state).length*q:0;}
  function validate(productKey,state,todayValue){
    const p=Object.hasOwn(products,productKey)?products[productKey]:null;const errors={};
    if(!p)return {product:'Bitte wähle ein Produkt.'};
    const list=names(state);const field=state.mode==='gruppe'?'names':'text';
    if(!list.length)errors[field]=state.mode==='gruppe'?'Bitte trage mindestens einen Namen ein.':'Bitte gib deinen Wunschtext ein.';
    else if(list.length>50)errors[field]='Bitte verwende höchstens 50 Namen. Größere Gruppen kannst du direkt per E-Mail anfragen.';
    else {
      const tooLong=list.findIndex(name=>length(displayText(name,state))>p.max);
      const invalid=list.findIndex(name=>/[\u0000-\u001f\u007f-\u009f]/.test(name));
      if(tooLong>=0)errors[field]=(state.mode==='gruppe'?'Name '+(tooLong+1)+': ':'')+'Bitte höchstens '+p.max+' Zeichen verwenden'+(state.uppercase?' – inklusive Großschreibung.':'.');
      else if(invalid>=0)errors[field]='Bitte entferne Steuerzeichen oder Tabulatoren aus deinem Text.';
    }
    if(p.subline&&length(displayText(state.subline,state))>30)errors.subline='Die zweite Zeile darf höchstens 30 Zeichen haben.';
    if(p.subline&&/[\u0000-\u001f\u007f-\u009f]/.test(state.subline))errors.subline='Bitte verwende für die zweite Zeile nur eine Textzeile.';
    if(!/^[1-9]\d{0,2}$/.test(String(state.quantity)))errors.quantity='Bitte gib eine ganze Anzahl zwischen 1 und 999 ein.';
    if(state.date&&(!validDate(state.date)||state.date<(todayValue||today())))errors.date='Bitte wähle heute oder einen späteren Wunschtermin.';
    if(length(state.notes)>600)errors.notes='Bitte beschränke deine Anmerkung auf 600 Zeichen.';
    if(!Object.hasOwn(fonts,state.font))errors.font='Bitte wähle einen Schriftstil.';
    if(!Object.hasOwn(motifs,state.motif))errors.motif='Bitte wähle ein Motiv.';
    if(!['einzeln','gruppe'].includes(state.mode))errors.mode='Bitte wähle die Art der Personalisierung.';
    return errors;
  }
  function request(productKey,state,todayValue){
    const errors=validate(productKey,state,todayValue);
    if(Object.keys(errors).length)throw new Error('Bitte zuerst die markierten Eingaben prüfen.');
    const p=products[productKey];const list=names(state);
    const formattedDate=state.date?state.date.split('-').reverse().join('.'):'Noch offen';
    const lines=[
      'Servus Nico,','',
      'ich möchte folgenden Entwurf unverbindlich anfragen:','',
      'Produkt: '+p.label,
      'Gesamtmenge: '+total(state)+' Stück',
      'Anzahl je Text: '+state.quantity,
      'Schriftstil: '+fonts[state.font].label,
      'Motiv: '+motifs[state.motif],
      'Schreibweise: '+(state.uppercase?'GROSSBUCHSTABEN':'Wie eingegeben'),'',
      'Personalisierung:'
    ];
    list.forEach(name=>lines.push(state.quantity+' × '+displayText(name,state)));
    if(p.subline&&normalize(state.subline))lines.push('Zweite Zeile bei allen: '+displayText(state.subline,state));
    lines.push('','Wunschtermin: '+formattedDate);
    if(normalize(state.notes))lines.push('Anmerkung: '+normalize(state.notes));
    lines.push('','Bitte bestätige Preis, Ausführung und möglichen Termin.','Dies ist eine unverbindliche Anfrage, keine Bestellung.','','Viele Grüße');
    const body=lines.join('\n');
    const subject='HOAMMADE Anfrage: '+p.label+' · '+total(state)+' Stück';
    const full='mailto:nico@hoammade.de?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    const long=full.length>1800;
    const shortBody='Servus Nico,\n\nich möchte '+total(state)+' '+p.label+' unverbindlich anfragen.\n\nMeine vollständige Konfiguration füge ich unten ein oder als Textdatei an.\n\nBitte bestätige Preis, Ausführung und möglichen Termin.\n\nViele Grüße';
    return {body,subject,long,href:long?'mailto:nico@hoammade.de?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(shortBody):full,total:total(state),formattedDate};
  }
  return Object.freeze({products,fonts,motifs,initial,chars,length,normalize,names,displayText,today,total,validate,request});
});
