'use strict';
const fs = require('node:fs');
function divide(n,d) { return d ? n/d : null; }
function wilson(success,total) {
  if (!total) return null;
  const z=1.959963984540054,p=success/total,d=1+z*z/total;
  const mid=(p+z*z/(2*total))/d;
  const delta=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
  return [Math.max(0,mid-delta),Math.min(1,mid+delta)];
}
function percentile(values,q) {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];
}
function evaluate(input) {
  const { kind, metadata, rows }=input;
  if (!metadata || !['model','promptVersion','datasetVersion','commit'].every(k=>typeof metadata[k]==='string'&&metadata[k].trim())) throw new Error('missing reproducibility metadata');
  if (!Array.isArray(rows)||!rows.length) throw new Error('no real labeled samples: results cannot be reported');
  const ids=new Set();
  for(const r of rows) {
    if (typeof r.id!=='string'||!r.id||ids.has(r.id)) throw new Error('missing or duplicate sample id'); ids.add(r.id);
    if (!Number.isFinite(r.latencyMs)||r.latencyMs<0) throw new Error('invalid latency');
  }
  const common={kind,metadata,n:rows.length,p50Ms:percentile(rows.map(r=>r.latencyMs),.5),p95Ms:percentile(rows.map(r=>r.latencyMs),.95)};
  if(kind==='review') {
    let tp=0,tn=0,fp=0,fn=0,agree=0;
    for(const r of rows) {
      if (![r.accepted,r.raterA,r.raterB].every(v=>typeof v==='boolean')) throw new Error('two independent boolean labels required');
      let truth=r.raterA;
      if(r.raterA===r.raterB) agree++;
      else if(typeof r.adjudicated!=='boolean') throw new Error('unresolved annotation disagreement');
      else truth=r.adjudicated;
      if(truth) { if(r.accepted)tp++;else fn++; } else {if(r.accepted)fp++;else tn++;}
    }
    const precision=divide(tp,tp+fp),recall=divide(tp,tp+fn);
    return {...common,exploratory:rows.length<200,tp,tn,fp,fn,precision,recall,f1:divide(2*tp,2*tp+fp+fn),falsePositiveRate:divide(fp,fp+tn),falsePositiveRateCI95:wilson(fp,fp+tn),accuracy:divide(tp+tn,rows.length),accuracyCI95:wilson(tp+tn,rows.length),rawAnnotatorAgreement:agree/rows.length};
  }
  if(kind==='retrieval') {
    const sums={1:0,3:0,5:0};let rr=0,empty=0,wrongTop1=0;
    for(const r of rows) {
      if(!Array.isArray(r.relevant)||!r.relevant.length||!Array.isArray(r.ranked)||![...r.relevant,...r.ranked].every(x=>typeof x==='string'&&x)) throw new Error('retrieval IDs and nonempty gold relevance required');
      if(new Set(r.ranked).size!==r.ranked.length) throw new Error('duplicate ranked result');
      const gold=new Set(r.relevant);
      for(const k of [1,3,5]) sums[k]+=r.ranked.slice(0,k).filter(id=>gold.has(id)).length/gold.size;
      const first=r.ranked.findIndex(id=>gold.has(id));rr+=first<0?0:1/(first+1);
      if(!r.ranked.length)empty++;else if(!gold.has(r.ranked[0]))wrongTop1++;
    }
    return {...common,exploratory:rows.length<100,recallAt1:sums[1]/rows.length,recallAt3:sums[3]/rows.length,recallAt5:sums[5]/rows.length,mrr:rr/rows.length,emptyRate:empty/rows.length,wrongTop1Rate:wrongTop1/rows.length,note:'wrongTop1Rate is not a calibrated silent-mismatch metric; user-facing confidence needs separate annotation.'};
  }
  throw new Error('unknown evaluation kind');
}
module.exports={evaluate,wilson,percentile};
if(require.main===module) {
  try { console.log(JSON.stringify(evaluate(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2)); }
  catch(error) {console.error(error.message);process.exitCode=1;}
}
