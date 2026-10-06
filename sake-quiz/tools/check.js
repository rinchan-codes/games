// 完成前の検査。node sake-quiz/tools/check.js
// - index.html 内のスクリプトの構文チェック
// - 47都道府県がそろっているか
// - 全種類の問題を大量に作り、正解が選択肢にあるか・重複がないか・正解が1つか
// - 出典URLが全銘柄にあり、sources.md に載っているか
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const sources = fs.readFileSync(path.join(dir, "sources.md"), "utf8");

let fails = 0;
const fail = (msg) => { fails++; console.log("NG  " + msg); };
const ok = (msg) => console.log("OK  " + msg);

function block(id) {
  const re = new RegExp('<script[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</script>');
  const m = html.match(re);
  if (!m) throw new Error("script#" + id + " が見つからない");
  return m[1];
}

// 1. 構文チェック（全scriptブロック）
for (const id of ["quiz-core", "quiz-ui"]) {
  try { new vm.Script(block(id), { filename: id }); ok("構文 " + id); }
  catch (e) { fail("構文 " + id + ": " + e.message); }
}
let DATA;
try { DATA = JSON.parse(block("sake-data")); ok("JSON sake-data（" + DATA.length + "銘柄）"); }
catch (e) { fail("JSON sake-data: " + e.message); process.exit(1); }

const ctx = { module: { exports: {} } };
vm.runInNewContext(block("quiz-core"), ctx);
const C = ctx.module.exports;

// 2. データの形
const prefNames = C.PREFS.map((p) => p[0]);
if (prefNames.length !== 47 || new Set(prefNames).size !== 47) fail("PREFS が47件でない");
const posKeys = new Set(C.PREFS.map((p) => p[2] + "," + p[3]));
if (posKeys.size !== 47) fail("タイルマップの位置が重なっている");

const seenBrand = new Set();
for (const d of DATA) {
  const name = d.brand + "（" + d.pref + "）";
  if (!prefNames.includes(d.pref)) fail(name + ": 都道府県名が不正");
  for (const k of ["brand", "brewery"]) if (!d[k]) fail(name + ": " + k + " がない");
  if (!Array.isArray(d.urls) || !d.urls.length) fail(name + ": 出典URLがない");
  for (const u of d.urls || []) {
    if (!/^https?:\/\//.test(u)) fail(name + ": URL形式 " + u);
    if (!sources.includes(u)) fail(name + ": sources.md にURLがない " + u);
  }
  if (d.founded != null && !(Number.isInteger(d.founded) && d.founded > 600 && d.founded <= 2026)) fail(name + ": 創業年が不正 " + d.founded);
  if (seenBrand.has(d.brand)) fail("銘柄名が重複: " + d.brand);
  seenBrand.add(d.brand);
}
const breweries = new Map();
for (const d of DATA) {
  if (breweries.has(d.brewery) && breweries.get(d.brewery) !== d.pref) fail("同名の蔵元が別の県に: " + d.brewery);
  breweries.set(d.brewery, d.pref);
}

// 3. 47都道府県
const covered = new Set(DATA.map((d) => d.pref));
const missing = prefNames.filter((p) => !covered.has(p));
const undocumented = missing.filter((p) => !C.EXCLUDED[p]);
if (undocumented.length) fail("データのない都道府県（理由の記載なし）: " + undocumented.join("、"));
if (!missing.length) ok("47都道府県すべてにデータあり");
else console.log("要確認  47都道府県のうち " + (47 - missing.length) + " 件にデータあり。理由を書いて外した県: " + missing.filter((p) => C.EXCLUDED[p]).join("、"));
for (const p of Object.keys(C.EXCLUDED)) if (covered.has(p)) fail(p + " は EXCLUDED なのにデータがある");
const perPref = {};
DATA.forEach((d) => { perPref[d.pref] = (perPref[d.pref] || 0) + 1; });
const single = prefNames.filter((p) => perPref[p] === 1);
if (single.length) console.log("    1銘柄のみ: " + single.join("、"));

// 4. 問題の検査
function checkQ(q, where) {
  if (!q) return;
  const labels = q.choices.map((c) => c.label);
  if (q.answer < 0 || q.answer >= labels.length) return fail(where + ": 正解が選択肢にない");
  if (new Set(labels).size !== labels.length) fail(where + ": 選択肢が重複 " + labels.join("/"));
  const need = q.type === "older" ? 2 : 4;
  if (labels.length !== need) fail(where + ": 選択肢の数 " + labels.length);
  const it = q.item;
  // 正解が1つだけか、種類ごとに事実から数え直す
  let correct;
  if (q.type === "pref" && it.brand.includes(C.shortPref(it.pref))) fail(where + ": 銘柄名に県名が入っている");
  if (q.type === "brewery" && it.brewery.includes(it.brand)) fail(where + ": 蔵元名に銘柄名が入っている");
  if (q.type === "pref") correct = labels.filter((l) => l === it.pref);
  else if (q.type === "brand") correct = labels.filter((l) => DATA.some((d) => d.brand === l && d.pref === it.pref));
  else if (q.type === "brewery") correct = labels.filter((l) => l === it.brewery);
  else if (q.type === "city") {
    if (!it.city) return fail(where + ": city が null なのに出題");
    correct = labels.filter((l) => l === it.pref + " " + it.city);
  } else if (q.type === "older") {
    const [a, b] = q.pair;
    if (!a.founded || !b.founded) return fail(where + ": 創業年 null で出題");
    if (Math.abs(a.founded - b.founded) < 10) fail(where + ": 創業年の差が10年未満");
    const older = a.founded < b.founded ? a : b;
    correct = labels.filter((l) => l === older.brand);
    if (labels[q.answer] !== older.brand) fail(where + ": 古さの正解が逆");
  }
  if (correct.length !== 1) fail(where + ": 正解に当たる選択肢が " + correct.length + " 個 " + labels.join("/"));
  if (labels[q.answer] !== correct[0]) fail(where + ": answer の位置が違う");
}

const rng = C.makeRng(12345);
let made = 0;
const typeCount = {};
for (let rep = 0; rep < 30; rep++) {
  for (const d of DATA) {
    for (const t of C.TYPES) {
      const q = C.make(t, d, DATA, rng);
      if (q) { made++; typeCount[t] = (typeCount[t] || 0) + 1; checkQ(q, t + " / " + d.brand); }
      else if (t !== "older" && t !== "brewery" && t !== "pref" && !(t === "city" && !d.city)) fail(t + " / " + d.brand + ": 問題が作れない");
    }
  }
}
ok("個別に " + made + " 問を検査 " + JSON.stringify(typeCount));

// 1回分の出題（全モード）
const pools = [["全国", DATA]].concat(C.REGIONS.map((r) => [r, DATA.filter((d) => C.regionOf[d.pref] === r)]));
for (const [name, pool] of pools) {
  for (let rep = 0; rep < 300; rep++) {
    const qs = C.round(DATA, pool, 10, rng);
    if (qs.length > 10 || qs.length < Math.min(10, pool.length)) fail(name + ": 問題数 " + qs.length);
    qs.forEach((q, i) => {
      checkQ(q, name + " 第" + (i + 1) + "問");
      if (!pool.includes(q.item) && !(q.pair && q.pair.some((p) => pool.includes(p)))) fail(name + ": 範囲外の銘柄が出題");
    });
  }
}
// まだの県モード：1県だけ残っている場合
for (const p of prefNames.filter((x) => covered.has(x))) {
  const pool = DATA.filter((d) => d.pref === p);
  const qs = C.round(DATA, pool, 10, rng);
  if (!qs.length) fail("まだの県（" + p + "のみ）: 問題が作れない");
  qs.forEach((q, i) => checkQ(q, "まだの県 " + p + " 第" + (i + 1) + "問"));
}
ok("1回分の出題を全モードで検査");

console.log(fails ? "\n" + fails + " 件の問題あり" : "\nすべてOK");
process.exit(fails ? 1 : 0);
