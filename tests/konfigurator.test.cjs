const assert = require('node:assert/strict');
const C = require('../konfigurator-core.js');
const today = '2026-10-16';
const base = () => ({...C.initial(), text:'Nico'});

for (const product of Object.keys(C.products)) {
  const state = {...base(), motif:'herz', font:'elegant', quantity:'3', subline:'Dahoam'};
  const request = C.request(product,state,today);
  assert.equal(request.total,3);
  assert.match(request.href,/^mailto:nico@hoammade.de\?/);
  assert.ok(request.body.includes('3 × Nico'));
  assert.ok(request.body.includes('Motiv: Herz'));
  assert.equal(request.body.includes('Zweite Zeile bei allen: Dahoam'),product==='untersetzer');
}

const group = {...base(),mode:'gruppe',names:'  Jörg  \r\n\n Léa\nAnna & Max',quantity:'2'};
const groupedRequest = C.request('glasanhaenger',group,today);
assert.equal(groupedRequest.total,6);
assert.ok(groupedRequest.body.includes('2 × Jörg'));
assert.ok(groupedRequest.body.includes('2 × Anna & Max'));
assert.equal(new URL(groupedRequest.href).searchParams.get('body'),groupedRequest.body);

for(const quantity of ['0','-1','1.5','1e2','1000','','01']) {
  assert.ok(C.validate('glupperl',{...base(),quantity},today).quantity);
}
assert.ok(C.validate('glupperl',C.initial(),today).text);
assert.ok(C.validate('glupperl',{...base(),text:'x'.repeat(19)},today).text);
assert.ok(C.validate('glupperl',{...base(),text:'Nico\tMax'},today).text);
assert.ok(C.validate('untersetzer',{...base(),subline:'x'.repeat(31)},today).subline);
assert.equal(C.length('e\u0301'),1);
assert.equal(C.length('👨‍👩‍👧'),1);
assert.equal(C.displayText('Straße',{uppercase:true}),'STRASSE');
assert.ok(C.validate('glupperl',{...base(),text:'ß'.repeat(10),uppercase:true},today).text);

for(const date of ['2026-10-15','2026-02-30','2027-13-01','abc']) {
  assert.ok(C.validate('glupperl',{...base(),date},today).date);
}
for(const date of ['2026-10-16','2027-02-28','2028-02-29']) {
  assert.equal(C.validate('glupperl',{...base(),date},today).date,undefined);
}

const largeGroup = {...base(),mode:'gruppe',names:Array.from({length:50},(_,i)=>'Gast Nummer '+(i+1)).join('\n'),quantity:'2',notes:'Ein gemeinsames Motiv. '.repeat(20)};
const longRequest = C.request('glupperl',largeGroup,today);
assert.equal(longRequest.total,100);
assert.equal(longRequest.long,true);
assert.ok(longRequest.href.length<1800);
assert.ok(longRequest.body.includes('2 × Gast Nummer 50'));
assert.equal((longRequest.body.match(/2 × Gast Nummer/g)||[]).length,50);
largeGroup.names+='\nGast Nummer 51';
assert.ok(C.validate('glupperl',largeGroup,today).names);
for(const product of ['unknown','toString','__proto__']) {
  assert.ok(C.validate(product,base(),today).product);
}
assert.ok(C.validate('glupperl',{...base(),font:'unknown'},today).font);
assert.ok(C.validate('glupperl',{...base(),motif:'unknown'},today).motif);
console.log('Konfigurator: alle Prüfungen erfolgreich.');
