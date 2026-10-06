// 使い方: node infra-defense/tools/sim.js   （V=1 で失敗の内訳とウェーブごとの信頼度）
const CORE = require('./check.js');
// 構成の手順：['inline'|'server', 位置, 機器] / ['up', 区画, 位置] / ['mv', 位置, ±1]。買えるようになった順に実行する
function run(stage, plan, seed) {
  const g = CORE.createGame(stage, seed);
  let pi = 0;
  const tryPlan = () => {
    while (pi < plan.length) {
      const a = plan[pi];
      let err;
      if (a[0] === 'up') err = CORE.upgrade(g, a[1], a[2]);
      else if (a[0] === 'mv') err = CORE.move(g, a[1], a[2]);
      else {
        const arr = a[0] === 'server' ? g.servers : g.inline;
        if (arr[a[1]] && arr[a[1]].key === a[2]) { pi++; continue; }
        if (arr[a[1]]) CORE.remove(g, a[0], a[1]);
        err = CORE.place(g, a[0], a[1], a[2]);
      }
      if (err) break;
      pi++;
    }
  };
  tryPlan();
  CORE.start(g);
  let k = 0;
  const why = {}; const tw = [];
  let lastW = 0;
  while (!g.over && k < 30 * 600) { CORE.step(g);
    for (const e of g.events) { if (e.kind==='fail') why[e.reason+(e.where!==undefined?'@'+(g.inline[e.where]?g.inline[e.where].key:e.where):'')]=(why[e.reason+(e.where!==undefined?'@'+(g.inline[e.where]?g.inline[e.where].key:e.where):'')]||0)+1;
      if (e.kind==='breach') why['breach_'+e.type]=(why['breach_'+e.type]||0)+1;
      if (e.kind==='waveEnd') tw.push(Math.round(g.trust)); }
    g.events.length = 0; if (++k % 15 === 0) tryPlan(); }
  if (process.env.V) console.log('   ', JSON.stringify(why), tw.join(' '));
  return { won: g.won, trust: +g.trust.toFixed(1), stars: g.result.stars, rate: +(g.result.rate*100).toFixed(1),
           wave: g.waveIdx + 1, t: Math.round(g.t), breaches: g.stats.breaches, money: g.money, plan: pi + '/' + plan.length };
}
const I=(i,k)=>['inline',i,k], S=(i)=>['server',i,'web'], U=(z,i)=>['up',z,i];
const ups=(n)=>Array.from({length:n},(_,i)=>U('server',i));
const plans = {
  0: {
    nothing: [],
    serversOnly: [S(1),S(2),S(3)],
    fwOnly: [I(0,'fw')],
    fwServersNoLb: [I(0,'fw'),S(1),S(2),S(3)],
    sensible: [I(0,'fw'),I(4,'lb'),S(1),I(2,'cache'),S(2),S(3),...ups(3)],
    fwLb2: [I(0,'fw'),I(4,'lb'),S(1)],
    fwLb3: [I(0,'fw'),I(4,'lb'),S(1),S(2)],
    fwLb2up: [I(0,'fw'),I(4,'lb'),S(1),...ups(2)],
    noCache: [I(0,'fw'),I(4,'lb'),S(1),S(2),S(3),S(4),...ups(4)],
  },
  1: { // start fw@0 lb@1
    nothing: [],
    noWaf: [I(3,'cache'),S(2),S(3),S(4),S(5),...ups(6)],
    sensible: [I(4,'lb'),I(1,'waf'),I(2,'cache'),['mv',2,-1],S(2),U('inline',2),S(3),S(4),...ups(5)],
    noAdd: [I(2,'cache'),I(3,'waf')],
    wafNoUp: [I(4,'lb'),I(1,'waf'),I(2,'cache'),['mv',2,-1],S(2),S(3),S(4),S(5),...ups(6)],
    wafBeforeCache: [I(4,'lb'),I(1,'waf'),I(2,'cache'),S(2),S(3),S(4),S(5),...ups(6)],
  },
  2: { // start fw@0
    nothing: [],
    noRl: [I(4,'lb'),I(1,'cache'),S(2),I(2,'waf'),S(3),U('inline',2),S(4),S(5),...ups(6)],
    sensible: [I(4,'lb'),I(3,'waf'),I(1,'rl'),S(2),I(2,'cache'),U('inline',1),U('inline',3),U('inline',0),S(3),S(4),...ups(5),S(5)],
    fewServers: [I(4,'lb'),I(3,'waf'),I(1,'rl'),I(2,'cache'),U('inline',1),U('inline',3),U('inline',0)],
    noUpRl: [I(4,'lb'),I(3,'waf'),I(1,'rl'),S(2),I(2,'cache'),U('inline',3),S(3),S(4),...ups(5),S(5)],
    lateWaf: [I(4,'lb'),I(1,'rl'),I(2,'cache'),S(2),I(3,'waf'),U('inline',1),U('inline',3),U('inline',0),S(3),S(4),...ups(5),S(5)],
    rlNoWaf: [I(4,'lb'),I(1,'rl'),I(2,'cache'),S(2),S(3),S(4),S(5),...ups(6)],
  }
};
for (const st of Object.keys(plans)) {
  console.log('== stage', +st + 1, CORE.STAGES[st].name);
  for (const [n, plan] of Object.entries(plans[st])) {
    const rs = [1,2,3,4,5].map(s => run(+st, plan, s));
    const wins = rs.filter(r => r.won).length;
    const avgT = (rs.reduce((a,r)=>a+r.trust,0)/rs.length).toFixed(1);
    const avgR = (rs.reduce((a,r)=>a+r.rate,0)/rs.length).toFixed(1);
    console.log(n.padEnd(12), 'win', wins+'/5', 'trust', avgT, 'served%', avgR, 'stars', rs.map(r=>r.stars).join(''), 'wave', rs.map(r=>r.wave).join(','), 't', rs[0].t, 'plan', rs[0].plan, 'money', rs[0].money);
  }
}
