/* Independent numerical core. Cephes rational approximations for erf/erfc
   retain precision in the tails; inverse CDF uses monotone bisection. */
(function (root) {
  'use strict';
  const polynomial = (x, coefficients) => coefficients.reduce((sum, coefficient) => sum * x + coefficient, 0);
  const monic = (x, coefficients) => coefficients.reduce((sum, coefficient) => sum * x + coefficient, 1);
  function erfc(x) {
    if (x < 0) return 2 - erfc(-x);
    if (x < 1) {
      const t = [9.60497373987051638749,90.0260197203842689217,2232.00534594684319226,7003.32514112805075473,55592.3013010394962768];
      const u = [33.5617141647503099647,521.357949780152679795,4594.32382970980127987,22629.0000613890934246,49267.3942608635921086];
      return 1 - x * polynomial(x*x,t) / monic(x*x,u);
    }
    if (x > 27.3) return 0;
    const p = x < 8 ? [2.46196981473530512524e-10,.564189564831068821977,7.46321056442269912687,48.6371970985681366614,196.520832956077098242,526.445194995477358631,934.52852717195760754,1027.55188689515710272,557.535335369399327526] : [.564189583547755073984,1.27536670759978104416,5.01905042251180477414,6.16021097993053585195,7.4097426995044893916,2.9788666537210024067];
    const q = x < 8 ? [13.2281951154744992508,86.7072140885989742329,354.937778887819891062,975.708501743205489753,1823.90916687909736289,2246.33760818710981792,1656.66309194161350182,557.535340817727675546] : [2.2605286322011727659,9.39603524938001434673,12.0489539808096656605,17.0814450747565897222,9.60896809063285878198,3.3690764510008151605];
    return Math.exp(-x*x) * polynomial(x,p) / monic(x,q);
  }
  function normalPDF(x, mean=0, standardDeviation=1) {
    if (!(standardDeviation > 0) || !Number.isFinite(standardDeviation)) return NaN;
    const z = calculateZ(x,mean,standardDeviation);
    return Math.exp(-0.5*z*z) / Math.sqrt(2*Math.PI) / standardDeviation;
  }
  function normalCDF(z) { return z < 0 ? 0.5*erfc(-z/Math.SQRT2) : 1-0.5*erfc(z/Math.SQRT2); }
  function normalSurvival(z) { return normalCDF(-z); }
  function inverseNormalCDF(p) {
    if (!(p>0 && p<1)) throw new RangeError('La probabilidad debe estar entre 0 y 1, sin incluirlos.');
    if (p===0.5) return 0;
    const target = p < 0.5 ? p : 1-p;
    let lower=-40, upper=0;
    for (let i=0;i<110;i++) {
      const mid=(lower+upper)/2;
      if (normalCDF(mid)<target) lower=mid; else upper=mid;
    }
    const z=(lower+upper)/2;
    return p<0.5 ? z : -z;
  }
  const calculateZ=(x,mean,standardDeviation)=>(x-mean)/standardDeviation;
  const calculateX=(z,mean,standardDeviation)=>mean+standardDeviation*z;
  function calculateProbability(region,z1,z2) {
    let p;
    if (region==='left') p=normalCDF(z1);
    else if (region==='right') p=normalSurvival(z1);
    else if (region==='outside') p=normalCDF(z1)+normalSurvival(z2);
    else if (region==='between') p=z1>=0 ? normalSurvival(z1)-normalSurvival(z2) : normalCDF(z2)-normalCDF(z1);
    else throw new RangeError('Selecciona una región.');
    return Math.max(0,Math.min(1,p));
  }
  function solve(state) {
    const {mean,standardDeviation,mode,regionType}=state;
    let region=regionType, xs, zs, probability;
    if (mode==='direct') {
      xs=['between','outside'].includes(region) ? [state.x,state.x2] : [state.x];
      zs=xs.map(x=>calculateZ(x,mean,standardDeviation));
      probability=calculateProbability(region,...zs);
    } else {
      probability=state.probability;
      if (region==='central') {
        const z=inverseNormalCDF((1-probability)/2);
        zs=[z,-z];region='between';
      } else zs=[region==='right' ? -inverseNormalCDF(probability) : inverseNormalCDF(probability)];
      xs=zs.map(z=>calculateX(z,mean,standardDeviation));
    }
    return {region,xs,zs,probability};
  }
  const api={normalPDF,normalCDF,normalSurvival,inverseNormalCDF,calculateZ,calculateX,calculateProbability,solve};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.NormalStats=api;
})(typeof window!=='undefined' ? window : globalThis);
