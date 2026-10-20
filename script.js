'use strict';

const Stats = window.NormalStats;
const $ = id => document.getElementById(id);
const initialState = {mean:50,standardDeviation:10,mode:'direct',regionType:'left',x:45,x1:45,x2:60,probability:0.95,z:-0.5,z1:-0.5,z2:1};
let state = {...initialState};
let reference = {mean:50,standardDeviation:10};
let result = null;
let announcementTimer;
let lastValidProbability = String(initialState.probability);
const numberIds = ['mean','standardDeviation','x','x2','probability'];
const format = (n,digits=3) => {
  if(n===0) return '0';
  if(Math.abs(n)>=1e7 || Math.abs(n)<Math.pow(10,-digits)) return n.toExponential(3);
  return Number(n.toFixed(digits)).toString();
};
const fixed = (n,digits=2) => (Math.abs(n)<0.5*Math.pow(10,-digits) ? 0 : n).toFixed(digits);
const pText = p => p>0 && p<0.00005 ? p.toExponential(3) : p<1 && p>0.99995 ? `1 − ${(1-p).toExponential(3)}` : fixed(p,4);
const percentText = p => p>0 && p*100<0.005 ? '< 0.01' : p<1 && p*100>99.995 ? '> 99.99' : fixed(p*100);
const valueText = n => format(n,6);
const SVG_NS='http://www.w3.org/2000/svg';
const directOptions=[['left','A la izquierda de x · P(X < x)'],['right','A la derecha de x · P(X > x)'],['between','Entre dos valores · P(x₁ < X < x₂)'],['outside','Fuera de dos valores · dos colas']];
const inverseOptions=[['left','Área acumulada a la izquierda'],['right','Área a la derecha'],['central','Área central simétrica']];
const examples=[
  {title:'A la izquierda',subtitle:'μ = 3 · σ = 0.5 · x = 2.3',mode:'direct',regionType:'left',mean:3,standardDeviation:0.5,x:2.3},
  {title:'A la derecha',subtitle:'μ = 40 · σ = 2 · x = 43',mode:'direct',regionType:'right',mean:40,standardDeviation:2,x:43},
  {title:'Entre dos valores',subtitle:'μ = 800 · σ = 40',mode:'direct',regionType:'between',mean:800,standardDeviation:40,x:778,x2:834},
  {title:'Otra cola derecha',subtitle:'μ = 300 · σ = 50 · x = 362',mode:'direct',regionType:'right',mean:300,standardDeviation:50,x:362},
  {title:'Dos colas',subtitle:'μ = 3 · σ = 0.005',mode:'direct',regionType:'outside',mean:3,standardDeviation:0.005,x:2.99,x2:3.01},
  {title:'Del área al límite',subtitle:'Área izquierda = 0.45',mode:'inverse',regionType:'left',mean:0,standardDeviation:1,probability:0.45},
  {title:'Un área a la derecha',subtitle:'μ = 40 · σ = 6 · p = 0.14',mode:'inverse',regionType:'right',mean:40,standardDeviation:6,probability:0.14},
  {title:'El 95 % central',subtitle:'μ = 1.50 · σ = 0.20',mode:'inverse',regionType:'central',mean:1.5,standardDeviation:0.2,probability:0.95}
];

function svgElement(tag,attributes={},text) {
  const node=document.createElementNS(SVG_NS,tag);
  Object.entries(attributes).forEach(([key,value])=>node.setAttribute(key,String(value)));
  if(text!==undefined) node.textContent=text;
  return node;
}
function append(parent,tag,attributes,text) { const node=svgElement(tag,attributes,text);parent.append(node);return node; }
function announce(message) {
  clearTimeout(announcementTimer);
  announcementTimer=setTimeout(()=>{$('announcement').textContent=message;},300);
}
function showError(id,message) {
  $(id).setAttribute('aria-invalid',String(Boolean(message)));
  $(`${id}-error`).hidden=!message;
  $(`${id}-error`).textContent=message;
}

function validateInputs() {
  const candidate={...state};
  const active=['mean','standardDeviation',...(state.mode==='direct' ? ['x',...(['between','outside'].includes(state.regionType)?['x2']:[])] : ['probability'])];
  let valid=true;
  numberIds.forEach(id=>showError(id,''));
  $('global-error').hidden=true;
  for(const id of active) {
    const raw=$(id).value.trim(), value=Number(raw);
    candidate[id]=value;
    let message='';
    if(raw==='' || !Number.isFinite(value)) message='Ingresa un número finito para continuar.';
    else if(id==='standardDeviation' && value<=0) message='La desviación estándar debe ser mayor que 0.';
    else if(id==='probability' && !(value>0 && value<1)) message='La probabilidad debe ser mayor que 0 y menor que 1.';
    if(message) {showError(id,message);valid=false;}
  }
  if(valid && state.mode==='direct' && ['between','outside'].includes(state.regionType) && candidate.x>=candidate.x2) {
    showError('x2','El límite inferior debe ser menor que el límite superior.');valid=false;
  }
  candidate.x1=candidate.x;
  if(valid) {
    const {mean:m,standardDeviation:s}=candidate;
    // Finite input can still overflow or collapse at machine precision.
    if(!Number.isFinite(m+8*s) || !Number.isFinite(m-8*s) || !Number.isFinite(1/s) || m+s===m || m-s===m) {
      showError('standardDeviation','Esta escala es demasiado extrema para representarla. Ajusta la media o la desviación estándar.');valid=false;
    }
  }
  return {valid,candidate};
}

function configureControls() {
  const inverse=state.mode==='inverse';
  $('mode-direct').setAttribute('aria-pressed',String(!inverse));
  $('mode-inverse').setAttribute('aria-pressed',String(inverse));
  $('region').replaceChildren(...(inverse?inverseOptions:directOptions).map(([value,label])=>new Option(label,value)));
  $('region').value=state.regionType;
  $('direct-fields').hidden=inverse;$('inverse-fields').hidden=!inverse;
  const pair=['between','outside'].includes(state.regionType);
  $('upper-field').hidden=!pair;
  $('x-label').innerHTML=pair ? 'Límite inferior <span class="math-symbol">x₁</span>' : 'Valor observado <span class="math-symbol">x</span>';
  $('x-slider-symbol').textContent=pair?'x₁':'x';
}
function syncFields() {numberIds.forEach(id=>{$(id).value=state[id];});lastValidProbability=String(state.probability);configureControls();syncSliders();}
function setSlider(id,min,max,value,step) {
  const node=$(id);node.min=min;node.max=max;node.step=step;node.value=value;
  node.setAttribute('aria-valuetext',valueText(value));
}
function syncSliders() {
  const s=state.standardDeviation, m=state.mean, base=reference.standardDeviation;
  setSlider('mean-slider',Math.min(reference.mean-4*base,m),Math.max(reference.mean+4*base,m),m,base/100);
  setSlider('sigma-slider',Math.min(base/5,s),Math.max(base*2.5,s),s,base/100);
  setSlider('x-slider',Math.min(m-4*s,state.x),Math.max(m+4*s,state.x),state.x,s/100);
}
function setMode(mode) {
  if(mode===state.mode) return;
  state.mode=mode;state.regionType='left';configureControls();update();
}
function loadExample(example) {
  state={...initialState,...example};state.x1=state.x;
  reference={mean:state.mean,standardDeviation:state.standardDeviation};
  $('show-reference').checked=true;
  syncFields();update();announce(`Ejemplo cargado: ${example.title || 'estado inicial'}. Puedes modificar los valores.`);
}
function invalidView(message) {
  result=null;
  $('chart-content').hidden=true;$('chart-empty').hidden=false;
  $('distribution-badge').textContent='Revisa los datos';
  $('results-content').innerHTML='<div class="result-empty">Completa los datos indicados. Aquí aparecerán el procedimiento y la interpretación.</div>';
  $('result-status').textContent='! Revisa los datos';$('rounding-note').hidden=true;
  if(message) {$('global-error').textContent=message;$('global-error').hidden=false;}
  announce(message || 'Revisa los campos indicados. El cálculo está pendiente.');
}
function update() {
  const {valid,candidate}=validateInputs();
  if(!valid) {invalidView();return;}
  const calculated=Stats.solve(candidate);
  const values=[...calculated.xs,...calculated.zs,calculated.probability];
  const domain=[reference.mean-4*reference.standardDeviation,reference.mean+4*reference.standardDeviation,candidate.mean-4*candidate.standardDeviation,candidate.mean+4*candidate.standardDeviation,...calculated.xs];
  const span=Math.max(...domain)-Math.min(...domain);
  if(values.some(n=>!Number.isFinite(n)) || !Number.isFinite(span*1.2) || (calculated.xs.length===2 && calculated.xs[0]===calculated.xs[1])) {
    invalidView('Estos valores exceden la precisión disponible. Usa una escala menos extrema o una probabilidad menos cercana a 0 o 1.');return;
  }
  state={...candidate,z:calculated.zs[0],z1:calculated.zs[0],z2:calculated.zs[1]};result=calculated;
  syncSliders();
  $('chart-content').hidden=false;$('chart-empty').hidden=true;$('rounding-note').hidden=false;
  $('distribution-badge').textContent=`μ = ${valueText(state.mean)} · σ = ${valueText(state.standardDeviation)}`;
  updateChart();renderCalculation();
  $('result-status').textContent='✓ Cálculo actualizado';
  announce(`Cálculo actualizado. Probabilidad: ${percentText(result.probability)} por ciento. ${result.zs.map((z,i)=>`z${result.zs.length===2?i+1:''} = ${fixed(z)}`).join('. ')}.`);
}

function getGeometry() {
  const {mean:m,standardDeviation:s}=state;
  const compare=$('show-reference').checked;
  let min=Math.min(m-4*s,...result.xs),max=Math.max(m+4*s,...result.xs);
  if(compare) {min=Math.min(min,reference.mean-4*reference.standardDeviation);max=Math.max(max,reference.mean+4*reference.standardDeviation);}
  const pad=(max-min)*0.04;min-=pad;max+=pad;
  const peak=Stats.normalPDF(m,m,s),refPeak=Stats.normalPDF(reference.mean,reference.mean,reference.standardDeviation);
  // Retaining a reference density scale makes concentration/height observable.
  const maxDensity=Math.max(peak,refPeak)*1.17;
  const mobile=window.matchMedia('(max-width: 480px)').matches;
  const base=mobile?360:277;
  return {min,max,compare,mobile,x:v=>66+(v-min)/(max-min)*684,y:d=>base-d/maxDensity*(mobile?270:213),base,maxDensity};
}
function curvePoints(from,to,mean,standardDeviation) {
  const points=[from,to];
  for(let i=0;i<=480;i++) {
    const value=mean+standardDeviation*(-9+18*i/480);
    if(value>from && value<to) points.push(value);
  }
  return points.sort((a,b)=>a-b);
}
function densityPath(from,to,mean,standardDeviation,g,filled=false) {
  if(to<=from) return '';
  const points=curvePoints(from,to,mean,standardDeviation);
  const line=points.map((v,i)=>`${i?'L':'M'}${g.x(v).toFixed(3)},${g.y(Stats.normalPDF(v,mean,standardDeviation)).toFixed(3)}`).join(' ');
  return filled ? `${line} L${g.x(to).toFixed(3)},${g.base} L${g.x(from).toFixed(3)},${g.base} Z` : line;
}
function updateShading(svg,g) {
  const {region,xs}=result;
  const intervals=region==='left'?[[g.min,xs[0]]]:region==='right'?[[xs[0],g.max]]:region==='between'?[[xs[0],xs[1]]]:[[g.min,xs[0]],[xs[1],g.max]];
  const group=append(svg,'g',{'data-testid':'shading','aria-label':'Área seleccionada'});
  for(const [from,to] of intervals) {
    const path=densityPath(from,to,state.mean,state.standardDeviation,g,true);
    append(group,'path',{d:path,fill:'#c4e5d7','data-region':region});
    append(group,'path',{d:path,fill:'url(#area-pattern)'});
  }
}
function markerLabels(values,g,minGap=95) {
  const actual=values.map(v=>g.x(v));
  const left=g.mobile?140:87,right=g.mobile?660:729;
  if(actual.length===2 && actual[1]-actual[0]<minGap) {
    const center=Math.max(left+minGap/2,Math.min(right-minGap/2,(actual[0]+actual[1])/2));
    return [center-minGap/2,center+minGap/2];
  }
  return actual.map(v=>Math.max(left,Math.min(right,v)));
}
function updateChart() {
  const svg=$('normal-chart'),g=getGeometry();
  svg.setAttribute('viewBox',`0 0 800 ${g.mobile?490:360}`);
  const description=`Distribución normal con media ${valueText(state.mean)} y desviación estándar ${valueText(state.standardDeviation)}. ${regionDescription()} Límites X: ${result.xs.map(valueText).join(' y ')}. Puntajes Z: ${result.zs.map(z=>fixed(z)).join(' y ')}. Probabilidad: ${percentText(result.probability)} por ciento.`;
  svg.replaceChildren(svgElement('title',{id:'chart-title'},'Distribución normal y área seleccionada'),svgElement('desc',{id:'chart-description'},description));
  const defs=append(svg,'defs');
  const pattern=append(defs,'pattern',{id:'area-pattern',width:7,height:7,patternUnits:'userSpaceOnUse',patternTransform:'rotate(35)'});
  append(pattern,'line',{x1:0,y1:0,x2:0,y2:7,stroke:'#4a9d86','stroke-width':1,opacity:.38});
  for(let i=1;i<=3;i++) append(svg,'line',{x1:66,x2:750,y1:g.base-i*(g.mobile?80:60),y2:g.base-i*(g.mobile?80:60),stroke:'#edf1ea','stroke-dasharray':'3 5'});
  append(svg,'text',{x:66,y:g.mobile?35:24,'font-size':11},'Densidad');
  if(g.compare) append(svg,'path',{d:densityPath(g.min,g.max,reference.mean,reference.standardDeviation,g),class:'reference'});
  updateShading(svg,g);
  append(svg,'path',{d:densityPath(g.min,g.max,state.mean,state.standardDeviation,g),class:'curve','data-testid':'normal-curve'});
  append(svg,'line',{x1:66,x2:750,y1:g.base,y2:g.base,stroke:'#bac9bd','stroke-width':1.2});
  const meanX=g.x(state.mean),top=g.y(Stats.normalPDF(state.mean,state.mean,state.standardDeviation));
  append(svg,'line',{x1:meanX,x2:meanX,y1:top-6,y2:g.base+6,stroke:'#356b60','stroke-dasharray':'5 5'});
  append(svg,'text',{x:Math.max(g.mobile?145:95,Math.min(g.mobile?660:720,meanX)),y:Math.max(g.mobile?65:40,top-17),'text-anchor':'middle',class:'mean-label'},`μ = ${valueText(state.mean)}`);
  // Use evenly spaced visible ticks; keep explicit selected-limit labels separate.
  const tickCount=g.mobile?3:6;
  for(let i=0;i<=tickCount;i++) {
    const v=g.min+(g.max-g.min)*i/tickCount,px=g.x(v);
    append(svg,'line',{x1:px,x2:px,y1:g.base,y2:g.base+5,stroke:'#bac9bd'});
    append(svg,'text',{x:px,y:g.base+(g.mobile?36:23),'text-anchor':g.mobile?(i===0?'start':i===tickCount?'end':'middle'):'middle','font-size':11},format(v,Math.min(10,Math.max(0,2-Math.floor(Math.log10(state.standardDeviation))))));
  }
  const labelXs=markerLabels(result.xs,g,g.mobile?240:110);
  result.xs.forEach((v,i)=>{
    const px=g.x(v),py=g.y(Stats.normalPDF(v,state.mean,state.standardDeviation));
    append(svg,'line',{x1:px,x2:px,y1:Math.min(py,g.base-14),y2:g.base,class:'marker','data-testid':`limit-${i}`});
    append(svg,'circle',{cx:px,cy:py,r:4,fill:'#b65b2b',stroke:'#fff','stroke-width':2});
    append(svg,'path',{d:`M${px},${g.base+5} L${px},${g.base+(g.mobile?62:33)} L${labelXs[i]},${g.base+(g.mobile?70:41)}`,fill:'none',stroke:'#b65b2b','stroke-width':1});
    append(svg,'text',{x:labelXs[i],y:g.base+(g.mobile?99:58),'text-anchor':'middle',class:'marker-label'},`${result.xs.length===2?`x${i===0?'₁':'₂'}`:'x'} = ${g.mobile?format(v,3):valueText(v)}`);
  });
  append(svg,'text',{x:792,y:g.base+(g.mobile?36:23),'text-anchor':'end','font-size':11},'X');
  $('region-caption').textContent=regionCaption();
  $('chart-probability').innerHTML=`${percentText(result.probability)} <small>% del área total</small>`;
  const extreme=result.zs.some(z=>Math.abs(z)>4);
  const underflow=result.probability===0 || result.probability===1;
  $('chart-note').innerHTML=`${extreme?'<span class="tail-warning">↔ Rango ampliado para incluir todos los límites.</span> ':''}La línea discontinua verde marca μ. ${g.compare?`Referencia gris: μ = ${valueText(reference.mean)}, σ = ${valueText(reference.standardDeviation)}. `:''}El área total es 1; las colas continúan hasta ±∞.${underflow?' El área extrema se aproxima a 0 o 1 dentro de la precisión numérica.':''}`;
  renderScales(g);
}
function renderScales(g) {
  const svg=$('scale-chart');
  svg.setAttribute('viewBox',`0 0 800 ${g.mobile?195:122}`);
  svg.replaceChildren(svgElement('title',{id:'scale-title'},'Escala original y escala estándar'),svgElement('desc',{id:'scale-description'},`X se transforma en Z mediante (x − μ) / σ. La media corresponde a cero. ${result.xs.map((v,i)=>`${valueText(v)} corresponde a ${fixed(result.zs[i])}`).join('. ')}.`));
  const mx=g.x(state.mean),labels=markerLabels(result.xs,g,g.mobile?240:110);
  const rows=g.mobile?[47,147]:[33,89];
  append(svg,'rect',{x:mx-1,y:rows[0],width:2,height:rows[1]-rows[0],fill:'#b2c5b9'});
  result.xs.forEach(v=>append(svg,'line',{x1:g.x(v),x2:g.x(v),y1:rows[0],y2:rows[1],stroke:'#c79f7e','stroke-dasharray':'2 4'}));
  rows.forEach((y,index)=>{
    append(svg,'text',{x:14,y:y+4,'font-size':12,'font-weight':600},index?'Z':'X');
    append(svg,'line',{x1:66,x2:750,y1:y,y2:y,stroke:'#bcc9bf'});
    append(svg,'circle',{cx:mx,cy:y,r:3.2,fill:'#477865'});
    append(svg,'text',{x:Math.max(100,Math.min(715,mx)),y:index?y+(g.mobile?36:22):y-12,'text-anchor':'middle',class:'mean-label'},index?'0':`μ = ${valueText(state.mean)}`);
    result.xs.forEach((v,i)=>{
      const px=g.x(v);
      append(svg,'circle',{cx:px,cy:y,r:4,fill:'#b65b2b',stroke:'#fff','stroke-width':1.5});
      const nearMean=Math.abs(labels[i]-mx)<75;
      const labelY=index?y-16:y+(g.mobile?36:22);
      append(svg,'text',{x:labels[i],y:labelY,'text-anchor':'middle',class:'marker-label','font-size':nearMean?11:12},`${index?'z':'x'}${result.xs.length===2?(i===0?'₁':'₂'):''} = ${index?fixed(result.zs[i]):g.mobile?format(v,3):valueText(v)}`);
    });
  });
}

function regionCaption() {
  return {left:'Área a la izquierda del límite',right:'Área a la derecha del límite',between:'Área entre los dos límites',outside:'Área en las dos colas exteriores'}[result.region];
}
function regionDescription() {
  return {left:'El área sombreada representa la probabilidad de obtener un valor menor que el límite seleccionado.',right:'El área sombreada representa la probabilidad de obtener un valor mayor que el límite seleccionado.',between:'El área sombreada representa la probabilidad de que X se encuentre entre los dos límites.',outside:'Las regiones sombreadas representan la probabilidad de obtener valores fuera del intervalo seleccionado.'}[result.region];
}
function probabilityExpression(scale='X') {
  const v=scale==='X'?result.xs.map(valueText):result.zs.map(z=>fixed(z));
  return {left:`P(${scale} &lt; ${v[0]})`,right:`P(${scale} &gt; ${v[0]})`,between:`P(${v[0]} &lt; ${scale} &lt; ${v[1]})`,outside:`P(${scale} &lt; ${v[0]}) + P(${scale} &gt; ${v[1]})`}[result.region];
}
function zInterpretation(z,index) {
  const subject=result.zs.length===2?`El límite ${index===0?'inferior':'superior'}`:'El valor';
  if(z===0) return `${subject} coincide con la media (z = 0).`;
  return `${subject} se encuentra aproximadamente ${Math.abs(z)<0.005?format(Math.abs(z),5):fixed(Math.abs(z))} desviaciones estándar por ${z<0?'debajo':'encima'} de la media.`;
}
function directCalculation() {
  const math=result.zs.map((z,i)=>{
    const sub=result.zs.length===2?(i===0?'₁':'₂'):'';
    return `<p class="formula">z${sub} = (${valueText(result.xs[i])} − (${valueText(state.mean)})) / ${valueText(state.standardDeviation)}<br><strong>z${sub} ≈ ${fixed(z)}</strong></p>`;
  }).join('');
  return `<p class="formula general">z = (x − μ) / σ</p>${math}${result.zs.map((z,i)=>`<p class="z-position">${zInterpretation(z,i)}</p>`).join('')}`;
}
function inverseCalculation() {
  const p=state.probability;
  let setup;
  if(state.regionType==='right') setup=`<p class="formula-detail">Primero, el complemento a la izquierda:</p><p class="formula">Φ(z) = 1 − ${format(p,6)}<br>Φ(z) ≈ ${pText(1-p)}</p>`;
  else if(state.regionType==='central') setup=`<p class="formula-detail">El área central es simétrica respecto a μ.</p><p class="formula">Área exterior = 1 − ${format(p,6)}<br>Área exterior ≈ ${pText(1-p)}<br>Cada cola: ${pText(1-p)} / 2 ≈ ${pText((1-p)/2)}</p><p class="formula-detail">Acumuladas: Φ(z₁) ≈ ${pText((1-p)/2)}; Φ(z₂) ≈ ${pText(1-(1-p)/2)}.</p>`;
  else setup=`<p class="formula">Φ(z) = ${format(p,6)}</p>`;
  const rows=result.zs.map((z,i)=>{
    const sub=result.zs.length===2?(i===0?'₁':'₂'):'';
    return `<p class="formula">z${sub} ≈ ${fixed(z)}<br>x${sub} ≈ (${valueText(state.standardDeviation)})(${fixed(z,6)}) + (${valueText(state.mean)})<br><strong>x${sub} ≈ ${valueText(result.xs[i])}</strong></p><p class="z-position">${zInterpretation(z,i)}</p>`;
  }).join('');
  return `${setup}<p class="formula general">z = Φ⁻¹(p<sub>izquierda</sub>)<br>x = σz + μ</p>${rows}`;
}
function probabilitySteps() {
  const [z1,z2]=result.zs;
  const f1=Stats.normalCDF(z1),f2=Stats.normalCDF(z2),s2=Stats.normalSurvival(z2);
  if(state.mode==='inverse') return `<p class="formula-detail">Área solicitada: ${format(state.probability,6)}. Los límites se obtienen con la inversa normal.</p><p class="formula">${probabilityExpression()} ≈ ${pText(result.probability)}</p>`;
  let steps='';
  if(result.region==='left') steps=`Φ(${fixed(z1)}) ≈ ${pText(f1)}`;
  if(result.region==='right') steps=`P(Z &gt; z) = 1 − Φ(z)<br>Φ(${fixed(z1)}) ≈ ${pText(f1)}<br>1 − ${fixed(f1,6)} ≈ ${pText(result.probability)}`;
  if(result.region==='between') steps=`Φ(${fixed(z2)}) ≈ ${pText(f2)}<br>Φ(${fixed(z1)}) ≈ ${pText(f1)}<br>Φ(z₂) − Φ(z₁)<br>≈ ${fixed(f2,6)} − ${fixed(f1,6)}<br>≈ ${pText(result.probability)}`;
  if(result.region==='outside') steps=`Cola izquierda: Φ(${fixed(z1)}) ≈ ${pText(f1)}<br>Cola derecha: 1 − Φ(${fixed(z2)}) ≈ ${pText(s2)}<br>Φ(z₁) + [1 − Φ(z₂)]<br>≈ ${fixed(f1,6)} + ${fixed(s2,6)}<br>≈ ${pText(result.probability)}`;
  return `<p class="formula">${probabilityExpression()}<br>≈ ${probabilityExpression('Z')}</p><p class="formula">${steps}</p>`;
}
function renderInterpretation() {
  const limits=result.xs.map(valueText),percentage=percentText(result.probability);
  const comparison=result.region==='left'?`menores que ${limits[0]}`:result.region==='right'?`mayores que ${limits[0]}`:result.region==='between'?`entre ${limits[0]} y ${limits[1]}`:`menores que ${limits[0]} o mayores que ${limits[1]}`;
  return `<article class="result-card interpretation"><div><div class="card-label">04 / INTERPRETACIÓN</div><h3>¿Cómo leer el resultado?</h3></div><p>${regionDescription()} Bajo este modelo normal, aproximadamente el <strong>${percentage} %</strong> del área corresponde a valores <strong>${comparison}</strong>. ${state.mode==='inverse'?'Partimos del área y encontramos los límites que la delimitan.':'La estandarización conserva la posición relativa del valor y el área seleccionada.'}</p></article>`;
}
function renderCalculation() {
  const inverse=state.mode==='inverse';
  const data=[['Media μ',valueText(state.mean)],['Desviación σ',valueText(state.standardDeviation)]];
  if(inverse) data.push(['Área p',format(state.probability,6)]);
  else result.xs.forEach((x,i)=>data.push([result.xs.length===2?(i===0?'Límite x₁':'Límite x₂'):'Valor x',valueText(x)]));
  $('results-content').innerHTML=`<article class="result-card"><div class="card-label">01 / DATOS</div><h3>El punto de partida</h3>${data.map(([label,value])=>`<div class="data-row"><span>${label}</span><strong>${value}</strong></div>`).join('')}<p class="formula-detail">${regionCaption()}${state.regionType==='central'?' · simétrica':''}</p></article><article class="result-card"><div class="card-label">02 / ${inverse?'TRANSFORMACIÓN INVERSA':'ESTANDARIZACIÓN'}</div><h3>${inverse?'De la probabilidad a z y a X':'Cálculo del puntaje z'}</h3>${inverse?inverseCalculation():directCalculation()}</article><article class="result-card probability-card"><div class="card-label">03 / PROBABILIDAD</div><h3>Del área a la probabilidad</h3>${probabilitySteps()}<div class="probability-value">${percentText(result.probability)} <small>%</small></div><div class="probability-decimal">P ≈ ${pText(result.probability)}</div><div class="probability-meter" aria-hidden="true"><span style="width:${result.probability*100}%"></span></div></article>${renderInterpretation()}`;
  $('rounding-note').textContent='Φ(z) es el área acumulada a la izquierda de z. Calculamos con precisión completa y redondeamos solo al mostrar. Por eso, sumar o restar los valores de una tabla ya redondeada puede cambiar la última cifra. En el procedimiento se muestran hasta 6 decimales para hacer visible esta diferencia.';
}

function isAllowedProbability(value) {
  const number=Number(value);
  return value.trim()!=='' && Number.isFinite(number) && number>0 && number<1;
}
function restoreProbability() {
  $('probability').value=lastValidProbability;
  update();
  announce('La probabilidad debe ser mayor que 0 y menor que 1. Se conserva el último valor válido.');
}
function handleProbabilityInput(event) {
  const input=$('probability');
  if(isAllowedProbability(input.value)) {
    lastValidProbability=input.value;
    update();
    return;
  }
  // Allow an unfinished decimal (0, 0.00…) or deletion while typing 0.005.
  // It is never calculated and is restored on blur/Enter if left unfinished.
  // Native spinner events are not text edits, so they cannot reach 0 or 1.
  const textEdit=event instanceof InputEvent &&
    (event.inputType==='insertText' || event.inputType.startsWith('delete'));
  if(textEdit && (input.value==='' || /^0*(?:\.0*)?$/.test(input.value))) {
    update();
    return;
  }
  restoreProbability();
}
function finishProbabilityEdit() {
  if(!isAllowedProbability($('probability').value)) restoreProbability();
}
numberIds.filter(id=>id!=='probability').forEach(id=>$(id).addEventListener('input',update));
$('probability').addEventListener('input',handleProbabilityInput);
$('probability').addEventListener('change',finishProbabilityEdit);
$('probability').addEventListener('blur',finishProbabilityEdit);
$('probability').addEventListener('beforeinput',event=>{
  if(event.data && /[-+eE]/.test(event.data)) event.preventDefault();
});
$('probability').addEventListener('paste',event=>{
  const pasted=event.clipboardData?.getData('text').trim();
  if(pasted!==undefined && !isAllowedProbability(pasted)) {
    event.preventDefault();
    announce('Solo puedes pegar una probabilidad mayor que 0 y menor que 1.');
  }
});
[['mean-slider','mean'],['sigma-slider','standardDeviation'],['x-slider','x']].forEach(([slider,field])=>{
  $(slider).addEventListener('input',()=>{$(field).value=$(slider).value;update();});
});
$('mode-direct').addEventListener('click',()=>setMode('direct'));
$('mode-inverse').addEventListener('click',()=>setMode('inverse'));
$('region').addEventListener('change',()=>{state.regionType=$('region').value;configureControls();update();});
$('show-reference').addEventListener('change',()=>{if(result)updateChart();});
window.matchMedia('(max-width: 480px)').addEventListener('change',()=>{if(result)updateChart();});
$('reset').addEventListener('click',()=>loadExample(initialState));
$('parameters-form').addEventListener('submit',event=>{
  event.preventDefault();update();
  if(result) {$('results').focus({preventScroll:true});$('results').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
  else document.querySelector('[aria-invalid="true"]')?.focus();
});
examples.forEach((example,index)=>{
  const button=document.createElement('button');button.type='button';button.className='example-button';
  button.innerHTML=`<span>${String(index+1).padStart(2,'0')} / ${example.mode==='inverse'?'PROCESO INVERSO':'EXPLORACIÓN'}</span><strong>${example.title}</strong><small>${example.subtitle}</small><span class="example-arrow" aria-hidden="true">↗</span>`;
  button.addEventListener('click',()=>loadExample(example));$('examples').append(button);
});
syncFields();update();
