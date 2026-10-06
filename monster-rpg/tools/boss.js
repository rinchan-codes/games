// 主ごとの勝率表。使い方: node monster-rpg/tools/boss.js [index.htmlのパス]
// 各主を、その時点で買える装備・満タンのHP/MPで300回ずつ戦わせる。
const fs=require("fs");
let code=fs.readFileSync(process.argv[2]||__dirname+"/../index.html","utf8");
code=code.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const C=new Function(code+"\nreturn CORE;")();
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const simsrc=fs.readFileSync(__dirname+"/sim.js","utf8");
const chooseAction=new Function("C",simsrc.match(/function chooseAction[\s\S]*?\n}\n/)[0]+"return chooseAction;")(C);
const cases=[["nejire",[5,6,7],["pebble","bark",null],{herb:5}],
 ["iwanaki",[11,12,13],["ironclaw","slate","rootcharm"],{herb:3,honey:4}],
 ["kageuo",[17,18,19],["obsidian","shellmail","springcharm"],{honey:6,drop:2}],
 ["banpei",[22,23,24],["starclaw","oldwood","lifecharm"],{honey:6,drop:3}],
 ["hainoou",[23,24,25,26],["ashclaw","oldwood","ashcharm"],{honey:6,drop:3,nectar:2}]];
for(const [boss,lvs,eq,items] of cases){
  for(const br of ["kiba","koura","tomo"]){
    const row=[];
    for(const lv of lvs){
      let win=0,turns=0,hpLeft=0;const N=300;
      for(let i=0;i<N;i++){
        const s=C.newSave("t");s.lv=lv;s.branch=lv>=8?br:null;s.equip={claw:eq[0],shell:eq[1],charm:eq[2]};s.items=Object.assign({},items);
        const st=C.stats(s);s.hp=st.maxhp;s.mp=st.maxmp;
        const B=C.startBattle(s,[boss],mulberry(i*7+lv),{boss:true});let t=0;
        while(!B.over&&t<200){C.runTurn(B,chooseAction(B));t++;}
        if(B.result==="win"){win++;hpLeft+=s.hp/st.maxhp;}turns+=t;
      }
      row.push(`Lv${lv}:${(win/N*100).toFixed(0)}% ${(turns/N).toFixed(0)}T`);
    }
    console.log(boss.padEnd(8),br.padEnd(6),row.join("  "));
  }
}
