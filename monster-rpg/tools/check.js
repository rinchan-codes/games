// 構文チェック。使い方: node monster-rpg/tools/check.js [index.htmlのパス]
// index.html の <script> を1つずつ取り出し、node --check にかける。
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const src = process.argv[2] || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(src, "utf8");
const parts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rpgcheck-"));
let ng = 0;
parts.forEach((code, i) => {
  const f = path.join(dir, "part" + i + ".js");
  fs.writeFileSync(f, code);
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); console.log("script " + i + ": OK (" + code.length + " chars)"); }
  catch (e) { ng++; console.log("script " + i + ": NG\n" + e.stderr.toString()); }
});
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ng ? 1 : 0);
