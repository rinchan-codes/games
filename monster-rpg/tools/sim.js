// バランスシミュレーション
// 使い方: node monster-rpg/tools/sim.js [index.htmlのパス] [1分岐あたりの回数] [--table]
// index.html の <script id="core"> だけを読み込み、町→フィールド→ダンジョン→主 を自動で進める。
const fs = require("fs");
const src = process.argv[2] || __dirname + "/../index.html";
let code = fs.readFileSync(src, "utf8");
if (src.endsWith(".html")) code = code.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const C = new Function(code + "\nreturn CORE;")();

// ---- 乱数 ----
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- マップ検査 ----
function bfs(map, start, passable) {
  const H = map.length, W = map[0].length, d = {}; const q = [start]; d[start] = 0;
  while (q.length) { const k = q.shift(); const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const c = map[ny][nx], nk = nx + "," + ny;
      if (nk in d || !passable(c)) continue; d[nk] = d[k] + 1; q.push(nk); } }
  return d;
}
function find(map, ch) { for (let y = 0; y < map.length; y++) { const x = map[y].indexOf(ch); if (x >= 0) return x + "," + y; } return null; }
const F = C.FIELD;
const errs = [];
if (F.length !== 30 || F.some(r => r.length !== 40)) errs.push("field size");
function fieldPass(flags) { return c => !("^~".includes(c)) && !(c === "R" && !flags.b1) && !(c === "B" && !flags.b2) && !(c === "W" && !flags.b3); }
const stages = [{}, { b1: 1 }, { b1: 1, b2: 1 }, { b1: 1, b2: 1, b3: 1 }];
const goals = [["1", "a"], ["2", "b"], ["3", "c"], ["4", "H"]];
const fieldDist = [];
stages.forEach((fl, i) => {
  const d = bfs(F, C.START.x + "," + C.START.y, fieldPass(fl));
  goals[i].forEach(g => { const p = find(F, g); if (!(p in d)) errs.push("field: stage " + i + " cannot reach " + g); });
  // 先の地方へは行けないこと
  if (i < 3) goals[i + 1].forEach(g => { const p = find(F, g); if (p in d) errs.push("field: stage " + i + " can reach " + g + " too early"); });
  const dt = bfs(F, find(F, goals[i][0]), fieldPass(fl));
  fieldDist.push(dt[find(F, goals[i][1])]);
});
const dgDist = {};
for (const [id, dg] of Object.entries(C.DUNGEONS)) {
  const m = dg.map; if (m.length !== 14 || m.some(r => r.length !== 20)) errs.push("size " + id);
  const st = find(m, "E") || find(m, "<");
  const d = bfs(m, st, c => !"#~".includes(c));
  const tgt = find(m, ">") && !dg.boss ? find(m, ">") : find(m, "X");
  if (!(tgt in d)) errs.push(id + " target unreachable");
  dgDist[id] = d[tgt];
  const nChest = m.join("").split("$").length - 1;
  if (nChest !== dg.chests.length) errs.push(id + " chest count " + nChest + " vs " + dg.chests.length);
  if (dg.down && !find(m, ">")) errs.push(id + " no >");
  if (dg.up && !find(m, "<")) errs.push(id + " no <");
  if (dg.enc && !C.ENC[dg.enc]) errs.push(id + " enc");
}
for (const [k, t] of Object.entries(C.TOWNS)) [...t.items].forEach(i => { if (!C.ITEMS[i]) errs.push("town item " + i); });
for (const [k, t] of Object.entries(C.TOWNS)) [...t.equips].forEach(i => { if (!C.EQUIPS[i]) errs.push("town equip " + i); });
for (const dg of Object.values(C.DUNGEONS)) dg.chests.forEach(c => { if (c[0] === "item" && !C.ITEMS[c[1]]) errs.push("chest item " + c[1]); if (c[0] === "equip" && !C.EQUIPS[c[1]]) errs.push("chest equip " + c[1]); });
for (const t of Object.values(C.ENC)) t.groups.forEach(g => g[1].forEach(id => { if (!C.ENEMIES[id]) errs.push("enemy " + id); }));
console.log("map/data check:", errs.length ? errs : "OK");
console.log("field dist town->dungeon:", fieldDist.join(" "), " dungeon:", JSON.stringify(dgDist));

// ---- 戦闘AI ----
function chooseAction(B) {
  const s = B.s, st = B.st, sk = C.skillsOf(s.lv, s.branch).map(id => [id, C.SKILLS[id]]);
  const al = C.alive(B);
  if (B.sleep > 0) return { type: "attack", target: 0 };
  const heals = sk.filter(([, k]) => k.kind === "heal" && k.mp <= s.mp).sort((a, b) => b[1].lo - a[1].lo);
  if (s.hp < st.maxhp * (B.boss ? 0.45 : 0.35)) {
    if (heals.length) return { type: "skill", id: heals[0][0] };
    const it = ["nectar", "honey", "herb"].find(i => s.items[i]);
    if (it) return { type: "item", id: it };
  }
  if (B.poison && B.boss && s.items.nut) return { type: "item", id: "nut" };
  const att = sk.filter(([, k]) => ["phys", "mag", "shell"].includes(k.kind) && k.mp <= s.mp);
  if (B.boss && s.mp < st.maxmp * 0.25 && s.items.drop && s.hp > st.maxhp * 0.5) return { type: "item", id: "drop" };
  if (sk.find(([id]) => id === "harden") && B.buf < 1.5 && B.boss && s.mp >= 2) return { type: "skill", id: "harden" };
  const mpRatio = s.mp / st.maxmp;
  const target = al.reduce((a, b) => (a.hp < b.hp ? a : b)).slot;
  if (al.length >= 2) { const all = att.filter(([, k]) => k.tgt === "all").sort((a, b) => b[1].mp - a[1].mp); if (all.length && mpRatio > 0.3) return { type: "skill", id: all[0][0], target }; }
  const one = att.filter(([, k]) => k.tgt === "one").sort((a, b) => b[1].mp - a[1].mp);
  if (one.length && (B.boss || (mpRatio > 0.5 && al[0].hp > st.atk * 0.6))) return { type: "skill", id: one[0][0], target };
  if (B.boss) { const all = att.filter(([, k]) => k.tgt === "all").sort((a, b) => b[1].mp - a[1].mp); if (all.length && C.skillsOf(s.lv, s.branch).includes("ashfire")) return { type: "skill", id: all[0][0], target }; }
  return { type: "attack", target };
}
function fight(s, ids, rng, boss) {
  const B = C.startBattle(s, ids, rng, { boss });
  let turns = 0;
  while (!B.over && turns < 200) { C.runTurn(B, chooseAction(B)); turns++; }
  return { res: B.result, turns, reward: B.reward };
}

// ---- 進行シミュレーション ----
const PH = [
  { town: "1", field: "A", fd: 0, minLv: 3, dg: ["d1a", "d1b"], boss: "nejire" },
  { town: "2", field: "B", fd: 1, dg: ["d2a", "d2b"], boss: "iwanaki" },
  { town: "3", field: "C", fd: 2, dg: ["d3a", "d3b"], boss: "kageuo" },
  { town: "4", field: "D", fd: 3, dg: ["t1", "t2"], boss: "banpei", next: ["t3", "hainoou"] }
];
const WANDER_F = 3, WANDER_D = 2;
function shop(s, town) {
  const T = C.TOWNS[town];
  // 強い順に買う：ツメ→カラ→おまもり
  for (const id of T.equips) {
    const e = C.EQUIPS[id];
    const cur = s.equip[e.slot] ? C.EQUIPS[s.equip[e.slot]] : null;
    const val = x => x ? (x.atk || 0) + (x.def || 0) + (x.hp || 0) / 3 + (x.agi || 0) / 2 + (x.int || 0) / 2 + (x.mp || 0) / 3 : 0;
    if (val(e) > val(cur) && s.gold >= e.price + 30) { s.gold -= e.price; s.equip[e.slot] = id; }
  }
  const herb = T.items.includes("honey") && s.lv >= 10 ? "honey" : "herb";
  while ((s.items[herb] || 0) < 5 && s.gold >= C.ITEMS[herb].price) { s.gold -= C.ITEMS[herb].price; s.items[herb] = (s.items[herb] || 0) + 1; }
  if (T.items.includes("drop") && s.branch === "tomo") while ((s.items.drop || 0) < 3 && s.gold >= 200) { s.gold -= 90; s.items.drop = (s.items.drop || 0) + 1; }
  if (!s.items.nut && s.gold > 10) { s.gold -= 10; s.items.nut = 1; }
}
function inn(s, town) { const st = C.stats(s); s.gold = Math.max(0, s.gold - C.TOWNS[town].inn); s.hp = st.maxhp; s.mp = st.maxmp; }
function fieldHeal(s) {
  const st = C.stats(s);
  let guard = 0;
  while (s.hp < st.maxhp * 0.6 && guard++ < 10) {
    const sk = C.skillsOf(s.lv, s.branch).map(id => [id, C.SKILLS[id]]).filter(([, k]) => k.kind === "heal" && k.mp <= s.mp).sort((a, b) => a[1].mp - b[1].mp);
    if (sk.length) { s.mp -= sk[0][1].mp; s.hp = Math.min(st.maxhp, s.hp + sk[0][1].lo + st.int * sk[0][1].k); continue; }
    break;
  }
}
function battleOnce(s, encId, rng, stat) {
  const g = C.pickGroup(encId, rng);
  const r = fight(s, g, rng, false);
  stat.battles++; stat.turns += r.turns;
  if (r.res === "win") {
    for (const ev of C.gainExp(s, r.reward.exp)) { if (ev.evolve) { C.evolve(s, stat.branch); C.gainExp(s, 0); } }
    s.gold += r.reward.gold;
    r.reward.drops.forEach(d => s.items[d] = (s.items[d] || 0) + 1);
  }
  if (r.res === "lose") { stat.deaths++; s.gold = Math.floor(s.gold / 2); return false; }
  fieldHeal(s);
  return true;
}
function runGame(branch, seed) {
  const rng = mulberry(seed);
  const s = C.newSave("sim");
  const stat = { branch, battles: 0, turns: 0, deaths: 0, steps: 0, ph: [], grind: 0 };
  const healItems = () => ["herb", "honey", "nectar"].filter(x => s.items[x]).length;
  function walk(enc, steps) { // 歩いて戦う。帰るべきならfalse
    stat.steps += steps;
    const n = Math.round(steps * C.ENC[enc].rate);
    for (let i = 0; i < n; i++) {
      if (!battleOnce(s, enc, rng, stat)) return "dead";
      const st = C.stats(s);
      if (s.hp < st.maxhp * 0.5) { const it = ["herb", "honey", "nectar"].find(x => s.items[x]); if (it) { s.items[it]--; s.hp = Math.min(st.maxhp, s.hp + C.ITEMS[it].hp); } }
      if (s.hp < st.maxhp * 0.5 && !healItems()) return "back";
    }
    return "ok";
  }
  for (const ph of PH) {
    const P = { lv0: s.lv, firstLv: null, firstWin: null, attempts: 0, deaths: 0, b0: stat.battles };
    stat.ph.push(P);
    let chestsDone = false, guard = 0;
    // 最初の洞窟の前に、外で少し慣らす
    while (ph.minLv && s.lv < ph.minLv) { shop(s, ph.town); inn(s, ph.town); walk(ph.field, 40); stat.grind++; }
    for (;;) {
      if (guard++ > 60) { stat.fail = true; return stat; }
      shop(s, ph.town); inn(s, ph.town);
      const segs = [[ph.field, Math.round(fieldDist[ph.fd] * WANDER_F)], ...ph.dg.map(d => [C.DUNGEONS[d].enc, Math.round(dgDist[d] * WANDER_D)])];
      let r = "ok";
      for (const [enc, steps] of segs) { r = walk(enc, steps); if (r !== "ok") break; }
      if (r === "dead") { P.deaths++; stat.deaths++; s.gold = Math.floor(s.gold / 2); continue; }
      if (r === "back") { stat.steps += 30; continue; }
      if (!chestsDone) {
        chestsDone = true;
        ph.dg.forEach(d => C.DUNGEONS[d].chests.forEach(c => {
          if (c[0] === "gold") s.gold += c[1];
          if (c[0] === "item") s.items[c[1]] = (s.items[c[1]] || 0) + c[2];
          if (c[0] === "equip") s.bag.push(c[1]);
        }));
        for (const id of s.bag) { const e = C.EQUIPS[id], cur = s.equip[e.slot] && C.EQUIPS[s.equip[e.slot]]; if (!cur || (e.atk || 0) + (e.def || 0) + (e.hp || 0) / 3 > (cur.atk || 0) + (cur.def || 0) + (cur.hp || 0) / 3) s.equip[e.slot] = id; }
      }
      { const st = C.stats(s); s.hp = st.maxhp; s.mp = st.maxmp; } // 主の手前の泉
      if (P.firstLv === null) P.firstLv = s.lv;
      P.attempts++;
      const res = fight(s, [ph.boss], rng, true);
      stat.battles++; stat.turns += res.turns;
      if (P.firstWin === null) P.firstWin = res.res === "win";
      if (res.res !== "win") {
        P.deaths++; stat.deaths++; s.gold = Math.floor(s.gold / 2);
        // 負けたら近くで1レベル稼ぐ
        shop(s, ph.town); inn(s, ph.town);
        const target = s.lv + 1; let g = 0;
        while (s.lv < target && g < 60) { if (!battleOnce(s, C.DUNGEONS[ph.dg[0]].enc, rng, stat)) { s.gold = Math.floor(s.gold / 2); } stat.grind++; g++; const st3 = C.stats(s); if (s.hp < st3.maxhp * 0.45) { inn(s, ph.town); stat.steps += 40; } }
        continue;
      }
      for (const ev of C.gainExp(s, res.reward.exp)) if (ev.evolve) { C.evolve(s, branch); C.gainExp(s, 0); }
      s.gold += res.reward.gold;
      break;
    }
    P.battles = stat.battles - P.b0;
    if (ph.next) {
      const P2 = { lv0: s.lv, firstLv: s.lv, attempts: 0, deaths: 0, b0: stat.battles };
      stat.ph.push(P2);
      for (;;) {
        const st2 = C.stats(s); s.hp = st2.maxhp; s.mp = st2.maxmp; // 頂上の泉
        P2.attempts++;
        const r2 = fight(s, ["hainoou"], rng, true); stat.battles++; stat.turns += r2.turns;
        if (P2.firstWin === undefined) P2.firstWin = r2.res === "win";
        if (r2.res === "win") break;
        P2.deaths++; stat.deaths++;
        shop(s, "4"); inn(s, "4");
        for (let i = 0; i < 10; i++) { battleOnce(s, "t", rng, stat); stat.grind++; const st3 = C.stats(s); if (s.hp < st3.maxhp * 0.45) inn(s, "4"); }
        if (P2.attempts > 30) { stat.fail = true; return stat; }
      }
      P2.battles = stat.battles - P2.b0;
    }
  }
  stat.final = { lv: s.lv, gold: s.gold, equip: s.equip, stats: C.stats(s) };
  return stat;
}
function fieldDistArr(i) { return fieldDist[i]; }

const N = +(process.argv[3] || 200);
for (const br of ["kiba", "koura", "tomo"]) {
  const R = []; for (let i = 0; i < N; i++) R.push(runGame(br, 1000 + i));
  const ok = R.filter(r => r.final);
  const avg = (arr, f) => (arr.reduce((a, r) => a + f(r), 0) / Math.max(1, arr.length));
  const names = ["根", "岩", "魚", "番兵", "王"];
  const cols = names.map((n, i) => {
    const ps = R.map(r => r.ph[i]).filter(Boolean);
    return `${n}:Lv${avg(ps, p => p.firstLv || 0).toFixed(1)} 初戦${(ps.filter(p => p.firstWin).length / Math.max(1, ps.length) * 100).toFixed(0)}% 戦${avg(ps, p => p.battles || 0).toFixed(0)} 全滅${avg(ps, p => p.deaths).toFixed(2)}`;
  });
  const battles = avg(R, r => r.battles), steps = avg(R, r => r.steps), turns = avg(R, r => r.turns);
  const minutes = (turns * 5 + battles * 6 + steps * 0.3) / 60 + 15;
  console.log(`[${br}] ` + cols.join(" | "));
  console.log(`   戦闘${battles.toFixed(0)}回 (稼ぎ${avg(R, r => r.grind).toFixed(0)}) 全滅${avg(R, r => r.deaths).toFixed(1)}回 歩数${steps.toFixed(0)} 推定${minutes.toFixed(0)}分 最終Lv${avg(ok, r => r.final.lv).toFixed(1)} 未クリア${R.length - ok.length}`);
}
// レベル表
if (process.argv.includes("--table")) {
  for (let lv = 1; lv <= 30; lv++) {
    const row = ["kiba", "koura", "tomo"].map(b => { const s = C.baseStats(lv, lv >= 8 ? b : null); return `${s.hp}/${s.mp} a${s.atk} d${s.def} s${s.agi} i${s.int}`; });
    console.log(lv, C.expFor(lv), row.join(" | "));
  }
}
