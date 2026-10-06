// index.html からスクリプトを抜き出して構文チェック、coreを読み込む
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((s, i) => { new vm.Script(s, { filename: 'script' + i + '.js' }); });
console.log('syntax OK:', scripts.length, 'scripts');
const ctx = {}; vm.createContext(ctx); vm.runInContext(scripts[0] + ';this.CORE=CORE;', ctx);
module.exports = ctx.CORE;
