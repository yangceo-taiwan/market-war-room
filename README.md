# 市場觀點戰情室

完全靜態、零資料庫、零登入、零付費 API 的市場資訊網站。第一版只整理公開市場資料、最新新聞索引與一般性市場觀點；不接收持股、基金、FCN 或任何個人資產資料。

> 重要：GitHub Pages 與一般 Cloudflare Pages 網址本質上是公開網址。「只分享給朋友」不等於真正的存取控制。本專案已設定 `noindex` 與 `robots.txt` 降低搜尋引擎收錄，但這不是密碼保護。因網站不放個資、私人持倉或個人化建議，即使連結外流，資訊邊界仍維持在公開市場資料。

## 已完成內容

- 市場首頁：台灣加權、S&P 500、Nasdaq、Dow、SOX、VIX、Total Put/Call、USD/TWD、美債 2Y/10Y、市場溫度、日線與小時線方向、資料時間與來源。
- 今日市場觀點：事實、刀神公開觀點入口、其他多空觀點、綜合結論、三種時間劇本、五大風險燈號、今日不做什麼。
- 新聞頁：最新 20 則的原文標題、中文標題欄位、來源、時間、分類與原文網址；不保存新聞全文。
- 資料健康頁：逐一顯示來源狀態、最後資料時間、最後嘗試時間與失敗訊息。
- GitHub Actions：每日台北時間 08:10、12:10、23:10 更新，更新後自動驗證與發布。
- 手機版響應式介面、繁中內容、Windows 一鍵安裝／啟動檔。

## 技術架構與隱私邊界

- Astro + TypeScript + Tailwind CSS。
- `output: "static"`；輸出資料夾為 `dist/`。
- 五份正式資料檔都在 `public/data/`：`market.json`、`breadth.json`、`news.json`、`viewpoints.json`、`reports.json`。
- 無 Supabase、無資料庫、無登入、無表單、無 Cookie、無分析追蹤、無 OpenAI API。
- 網站本身不向第三方行情端點發請求；外部抓取只在 GitHub Actions 建置階段執行，瀏覽者只下載靜態檔案。

## 本機啟動

### Windows 最簡方式

1. 安裝 [Node.js 24 LTS](https://nodejs.org/)。
2. 雙擊 `setup.bat`。
3. 雙擊 `run-local.bat`。
4. 開啟畫面所顯示的 Local 網址。

### 指令方式

```bash
npm install
npm run dev
```

建置檢查：

```bash
npm run build
```

手動更新公開資料：

```bash
npm run update:data
```

專案初始 JSON 是清楚標記的示範資料。第一次成功執行更新後，能取得的欄位會改為 `ok`；失敗欄位維持舊值並標記 `fallback`。

## 公開資料來源與替換方式

所有網址與代碼集中在 `scripts/source-config.ts`，抓取與畫面彼此分離，可單獨替換來源。

| 類型 | 第一版來源 | 性質 | 失敗處理 |
|---|---|---|---|
| 台灣加權 | TWSE OpenAPI | 官方公開 | 沿用上次成功值 |
| VIX、2Y、10Y | FRED | 美國官方／準官方資料庫 | 各系列獨立降級 |
| Put/Call | Cboe Daily Market Statistics | 官方公開頁面 | 沿用上次成功值 |
| 美股指數、USD/TWD | Yahoo Finance 公開圖表端點 | 非官方、免金鑰日線，無 SLA | 可在設定檔換成其他合法來源 |
| 新聞 | Fed RSS、SEC RSS、TWSE OpenAPI | 官方公開 | 任一 feed 成功即可更新 |
| 市場寬度 | `content/manual-breadth.json` | 人工維護 | 顯示人工資料時間 |
| 刀神／其他觀點 | `content/manual-viewpoints.json` | 人工附公開連結 | 沒有可驗證連結就顯示無資料 |

### 合法抓取原則

- 只讀無需登入的公開端點、RSS、OpenAPI 或公開頁面。
- 不繞過登入、驗證、CAPTCHA、robots 限制或付費牆。
- 不保存新聞全文，只保存標題、來源、時間、分類與原文網址。
- Facebook 無法穩定公開讀取時，不嘗試規避；改用 YouTube、官網或人工檔。
- 上線前仍應由網站管理者確認各來源的最新使用條款、頻率限制與再利用條件。來源條款可能變更。

## 規則引擎與公式

第一版不用 AI。市場溫度以 50 分為中性起點，最後限制在 0～100 分：

| 訊號 | 加減分 |
|---|---:|
| Advance/Decline ≥ 1.2 | +8 |
| Advance/Decline ≤ 0.8 | -8 |
| 站上 50 日線 ≥ 60% | +8 |
| 站上 50 日線 ≤ 40% | -8 |
| VIX < 15 | +8 |
| 15 ≤ VIX < 20 | +3 |
| 20 ≤ VIX < 25 | -5 |
| 25 ≤ VIX < 30 | -10 |
| VIX ≥ 30 | -14 |
| 0.7 ≤ Total Put/Call ≤ 1.1 | +3 |
| Total Put/Call > 1.4 | -6 |
| 其他 Put/Call 區間 | -2 |
| 10Y–2Y ≥ 0 | +4 |
| 10Y–2Y < 0 | -4 |
| 主要指數日線偏多 | +8 |
| 主要指數日線偏空 | -8 |

溫度燈號：65～100 綠燈、50～64 黃燈、35～49 橘燈、0～34 紅燈。

日線方向：台灣加權、S&P 500、Nasdaq、Dow、SOX 的單日漲跌幅大於 +0.2% 計 +1，小於 -0.2% 計 -1；合計 ≥ 2 為 `bull`、≤ -2 為 `bear`，其餘為 `mixed`。

小時線：第一版沒有找到同時符合免費、合法、無金鑰且穩定的所有指數小時資料，因此明確保留 `mixed`，不以日線冒充小時線。未來更換合規來源後可擴充。

這些門檻只是固定、可稽核的資訊整理規則，不是統計模型，不代表未來報酬，更不保證獲利。

## 人工更新公開觀點

編輯 `content/manual-viewpoints.json`：

```json
{
  "knifeGod": {
    "author": "刀神",
    "stance": "neutral",
    "summary": "只寫公開內容的短摘要，不搬運全文。",
    "publishedAt": "2026-07-23T01:00:00.000Z",
    "sourceUrl": "https://公開可直接開啟的網址",
    "verification": "manual"
  },
  "bulls": [],
  "bears": []
}
```

完成後執行 `npm run update:data`。若來源需登入或無公開連結，請維持 `null`。

英文官方 RSS 在第一版會保留英文原題，並在 `titleZh` 明確標記「英文原題待人工校訂」。這是刻意的品質邊界：不用 AI 時，不以不可靠的逐字替換假裝完成中文翻譯。需要正式對外發布前，應人工校訂中文標題。

## GitHub Pages 部署

1. 建立 GitHub repository，將完整專案推到 `main` 分支。
2. Repository → **Settings → Pages**。
3. Source 選 **GitHub Actions**。
4. 手動執行一次 **更新市場公開資料** workflow。
5. `deploy-pages.yml` 會自動用 `https://帳號.github.io/儲存庫名/` 的路徑建置。

專案已採 Astro 官方建議的 GitHub Pages Action。若 repository 是特殊的 `帳號.github.io` 首頁型 repository，請把 workflow 的 `SITE_BASE` 改為 `/`。

## Cloudflare Pages 部署

1. 將專案推到 GitHub。
2. Cloudflare Dashboard → **Workers & Pages → Create application → Pages → Import an existing Git repository**。
3. Production branch：`main`。
4. Build command：`npm run build`。
5. Build output directory：`dist`。
6. Environment variables：`SITE_URL=https://你的專案.pages.dev`、`SITE_BASE=/`。
7. 儲存並部署。

Cloudflare Pages 會在每次 GitHub 更新資料 commit 後重新發布。`public/_headers` 會在 Cloudflare Pages 套用基本安全標頭；GitHub Pages 不支援這個檔案的標頭功能，但不影響頁面。

## 排程與時區

`.github/workflows/update-data.yml` 使用 UTC：

- `10 0 * * *` → 台北 08:10
- `10 4 * * *` → 台北 12:10
- `10 15 * * *` → 台北 23:10

檔案將三個時間合併為 `10 0,4,15 * * *`。GitHub Actions 排程可能因平台負載延遲數分鐘，不應把 08:10 理解為秒級保證。

## 失敗與退場機制

1. 每個來源獨立執行；單一來源失敗不會清空其他資料。
2. 新資料抓取或格式解析失敗，就保留上次成功值。
3. `market.json` 每個指標都有 `asOf`、`sourceId`、`status`。
4. 健康頁顯示最後嘗試時間與錯誤原因。
5. 更新後先執行完整建置；建置失敗就不提交資料。
6. 若某來源長期失效，只需替換 `scripts/source-config.ts` 與對應 provider，不必改畫面。

## 上線前檢查表

- [ ] 首次執行 `npm run update:data`，確認不再只是示範資料。
- [ ] 開啟資料健康頁，確認沒有長期 `fallback`。
- [ ] 核對各公開來源最新條款與標示方式。
- [ ] 人工校訂英文新聞的中文標題。
- [ ] 刀神與外部觀點皆附無需登入的公開連結。
- [ ] GitHub Pages 或 Cloudflare Pages 網址用手機實測。
- [ ] 確認網站沒有任何私人持倉、姓名、聯絡資料或可回推個人的內容。

## 免責聲明

本專案只提供一般性市場資料整理、新聞索引與固定規則產生的觀察，不構成投資建議、投資招攬、適合度判斷或獲利保證。任何市場資料都可能延遲、錯誤或中斷；使用者應回到原始來源查證。
