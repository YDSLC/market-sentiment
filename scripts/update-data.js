const fs = require("fs");
const path = require("path");
const { isWorkday } = require("workday-cn");
const TODAY = new Date().toISOString().slice(0, 10);

if (!isWorkday(TODAY)) {
  console.log(`⏭️ ${TODAY} 非交易日，跳过。`);
  process.exit(0);
}

async function fetchQuotes() {
  const url = "https://push2.eastmoney.com/api/qt/clist/get" +
    "?pn=1&pz=6000&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281" +
    "&fltt=2&invt=2&fid=f3" +
    "&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23" +
    "&fields=f2,f3,f5";
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  if (!json?.data?.diff?.length) throw new Error("接口无行情数据");
  return json.data.diff;
}

function compute(quotes) {
  let up = 0, down = 0, flat = 0, upVol = 0, downVol = 0;
  for (const s of quotes) {
    const chg = s.f3, prc = Number(s.f2), vol = Number(s.f5);
    if (typeof chg !== "number" || !isFinite(chg)) continue;
    if (!isFinite(prc) || prc <= 0 || !isFinite(vol) || vol <= 0) continue;
    if (chg > 0) { up++; upVol += vol; }
    else if (chg < 0) { down++; downVol += vol; }
    else flat++;
  }
  const total = up + down + flat;
  if (total < 1000) throw new Error("样本过少：" + total);
  if (down === 0 || downVol === 0) throw new Error("无下跌，TRIN 无意义");
  const redRate = Math.max(0, Math.min(100, (up / total) * 100));
  const trin = (up / down) / (upVol / downVol);
  if (!isFinite(trin) || trin <= 0) throw new Error("TRIN 异常");
  const trinScore = Math.max(0, Math.min(100, (2 - trin) * 50));
  const score = redRate * 0.4 + trinScore * 0.6;
  return { date: TODAY, redRate: +redRate.toFixed(1), trin: +trin.toFixed(2), score: +score.toFixed(1) };
}

(async () => {
  try {
    const quotes = await fetchQuotes();
    const record = compute(quotes);
    let arr = [];
    if (fs.existsSync(path.join(__dirname, "..", "data.json"))) {
      arr = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data.json"), "utf-8"));
    }
    const idx = arr.findIndex(r => r.date === record.date);
    if (idx >= 0) arr[idx] = record; else arr.push(record);
    arr.sort((a, b) => a.date.localeCompare(b.date));
    if (arr.length > 120) arr = arr.slice(-120);
    fs.writeFileSync(path.join(__dirname, "..", "data.json"), JSON.stringify(arr, null, 2), "utf-8");
    console.log("✅ 已写入：", record);
  } catch (e) {
    console.error("❌ 更新失败：", e.message);
    process.exit(1);
  }
})();
