import { chromium } from 'playwright'

export interface ScrapedPage {
  url: string
  text: string
  error?: string
}

/**
 * 指定URLのページテキストをPlaywrightで取得する
 * JavaScriptレンダリング済みのテキストを返す
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // 不要な要素を除去してテキスト取得
    const text = await page.evaluate(() => {
      // script/style/nav/footer を除去
      const remove = document.querySelectorAll('script, style, nav, footer, header')
      remove.forEach(el => el.remove())
      return document.body?.innerText ?? ''
    })

    return { url, text: text.slice(0, 8000) } // 1ページ最大8000文字

  } catch (e) {
    return { url, text: '', error: String(e) }
  } finally {
    await browser.close()
  }
}

/**
 * 複数URLを順番にスクレイピングして結果をまとめて返す
 */
export async function scrapePages(urls: string[]): Promise<ScrapedPage[]> {
  const results: ScrapedPage[] = []
  for (const url of urls) {
    console.log(`[SCRAPER] 取得中: ${url}`)
    const result = await scrapePage(url)
    if (result.error) {
      console.log(`[SCRAPER] エラー: ${url} — ${result.error}`)
    } else {
      console.log(`[SCRAPER] 完了: ${url} (${result.text.length}文字)`)
    }
    results.push(result)
    await new Promise(r => setTimeout(r, 1500)) // レート制限
  }
  return results
}
