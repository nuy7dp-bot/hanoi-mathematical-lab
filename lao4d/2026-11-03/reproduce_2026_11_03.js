#!/usr/bin/env node
"use strict";
// Reproduce frozen 2026-11-03 Lao 4D ranking, without modifying the locked CSV.
// Requires Node.js 18+ only.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=__dirname,target="2026-11-03";
const raw=fs.readFileSync(path.join(root,"lao4d_2026_11_03_training_input.csv"),"utf8").trim().split(/\r?\n/).map(line=>{
 const [date,num]=line.split(",");if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^\d{4}$/.test(num))throw Error("Invalid row "+line);
 return {date,num};
});
if(raw.length!==148||raw[0].date!=="2026-11-02"||raw[0].num!=="8155")throw Error("Unexpected training data");
if(new Set(raw.map(x=>x.date)).size!==148||raw.some((x,i)=>x.date>=target||(i>0&&x.date>=raw[i-1].date)))throw Error("Date leakage or duplicate");
const digits=Array.from({length:10000},(_,n)=>String(n).padStart(4,"0").split("").map(Number));
const xs=[...raw].reverse().map(x=>x.num.split("").map(Number)),N=xs.length;
function probs(x,k,weights=null){
 const out=[],W=weights?weights.reduce((a,b)=>a+b,0):x.length;
 for(let p=0;p<5-k;p++){
  const ct=new Float64Array(10**k);
  for(let i=0;i<x.length;i++){let idx=0;for(let j=0;j<k;j++)idx=idx*10+x[i][p+j];ct[idx]+=weights?weights[i]:1;}
  out.push(Array.from(ct,v=>(v+1)/(W+10**k)));
 }
 return out;
}
function score(ps,k){
 const z=new Float64Array(10000);
 for(let m=0;m<10000;m++){
  let s=0;
  for(let p=0;p<5-k;p++){let idx=0;for(let j=0;j<k;j++)idx=idx*10+digits[m][p+j];s+=Math.log(ps[p][idx]);}
  z[m]=s;
 }
 return z;
}
function zscore(x){
 const mu=x.reduce((a,b)=>a+b,0)/x.length;let vv=0;
 for(const v of x)vv+=(v-mu)**2;
 const sd=Math.sqrt(vv/x.length);if(!(sd>0))throw Error("Zero variance");
 return Array.from(x,v=>(v-mu)/sd);
}
function mix(terms,k){
 let out=null;
 for(const [window,w] of terms){
  const p=probs(xs.slice(-window),k);
  if(!out)out=p.map(row=>row.map(v=>v*w));
  else for(let i=0;i<p.length;i++)for(let j=0;j<p[i].length;j++)out[i][j]+=p[i][j]*w;
 }
 return out;
}
const ew=xs.map((_,i)=>2**(-(N-1-i)/30));
const rec=score(probs(xs,1,ew),1),freq=score(probs(xs,1),1),pair=score(probs(xs,2),2);
const zr=zscore(rec),zf=zscore(freq),zp=zscore(pair);
const v2R=Array.from({length:10000},(_,i)=>(zf[i]+zp[i]+zr[i])/3);
const pos3=zscore(score(mix([[30,.5],[60,.3],[120,.2]],1),1));
const pair3=zscore(score(mix([[60,.6],[120,.4]],2),2));
const triple3=zscore(score(probs(xs.slice(-120),3),3));
const v3=Array.from({length:10000},(_,i)=>.45*pos3[i]+.25*pair3[i]+.15*triple3[i]+.15*zr[i]);
const v4A=Array.from(freq);
const scores={v2R,v3,v4A},ranks={},tops={};
for(const [name,s] of Object.entries(scores)){
 const order=Array.from({length:10000},(_,i)=>i).sort((a,b)=>s[b]-s[a]||a-b);
 const rank=new Int32Array(10000);
 order.forEach((v,i)=>rank[v]=i+1);
 if(new Set(rank).size!==10000)throw Error("Incomplete ranking");
 ranks[name]=rank;tops[name]=order.slice(0,10).map(x=>String(x).padStart(4,"0"));
}
const lines=["number,v2R_rank,v2R_score,v3_rank,v3_score,v4A_rank,v4A_log_score"];
for(let i=0;i<10000;i++){
 lines.push([String(i).padStart(4,"0"),ranks.v2R[i],scores.v2R[i].toFixed(15),ranks.v3[i],scores.v3[i].toFixed(15),ranks.v4A[i],scores.v4A[i].toFixed(15)].join(","));
}
const csv=lines.join("\r\n")+"\r\n";
const hash=crypto.createHash("sha256").update(csv,"utf8").digest("hex");
const expected="cbad0cff2a96ab677435877e09738de87e7a6b836254510c0abff1060c81a81d";
if(hash!==expected)throw Error("SHA256 mismatch: "+hash);
const out=path.join(root,"recomputed_2026_11_03_ranking.csv");
fs.writeFileSync(out,csv,{flag:"wx"});
console.log(JSON.stringify({target,training_draws:N,ranking_rows:10000,sha256:hash,top_10:tops,output:out},null,2));
