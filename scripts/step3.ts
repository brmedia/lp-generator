import { chromium, Page } from 'playwright'
import { saveJSON } from './utils'
import * as fs from 'fs'

export interface Review {
  id: number
  rating: number | null
  user: string | null
  date: string | null
  review: string
}

export interface ReviewData {
  reviewSummary: {
    count: number
    averageRating: string | null
    source: string
    fetchedAt: string
    targetPeriod: string
  }
  reviews: Review[]
}

function getOneYearAgo(): Date {
  const d = new Date()
  d.setDate(d.getDate() - 365)
  return d
}

function detectSource(url: string): 'jalan' | 'rakuten' | 'google' {
  if (url.includes('jalan.net')) return 'jalan'
  if (url.includes('rakuten.co.jp')) return 'rakuten'
  if (url.includes('google.com') || url.includes('maps.google')) return 'google'
  throw new Error(`口コミソースを判定できませんでした: ${url}`)
}

function calcAverage(reviews: Review[]): string | null {
  const ratings = reviews.map(r => r.rating).filter((r): r is number => r !== null)
  if (!ratings.length) return null
  return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)
}

export async function runStep3(slug: string, reviewUrl: string): Promise<void> {
  console.log('[STEP3] 口コミ抽出を開始します...')
  console.log(`[STEP3] URL: ${reviewUrl}`)

  const source = detectSource(reviewUrl)
  const oneYearAgo = getOneYearAgo()
  console.log(`[STEP3] ソース: ${source} / 取得対象: ${oneYearAgo.toLocaleDateString('ja-JP')}以降`)

  if (fs.existsSync('docs/scraper-notes.md')) {
    console.log('[STEP3] docs/scraper-notes.md を参照します')
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })

  let reviews: Review[] = []

  try {
    await page.goto(reviewUrl, { waitUntil: 'networkidle', timeout: 30000 })

    if (source === 'jalan') {
      reviews = await extractJalan(page, oneYearAgo)
    } else if (source === 'rakuten') {
      reviews = await extractRakuten(page, oneYearAgo)
    } else if (source === 'google') {
      reviews = await extractGoogle(page, oneYearAgo)
    }
  } catch (e) {
    console.error('[STEP3] エラー:', e)
    updateScraperNotes(source, `エラー発生: ${e}`, false)
    throw e
  } finally {
    await browser.close()
  }

  const reviewData: ReviewData = {
    reviewSummary: {
      count: reviews.length,
      averageRating: calcAverage(reviews),
      source,
      fetchedAt: new Date().toISOString(),
      targetPeriod: `${oneYearAgo.toLocaleDateString('ja-JP')}〜${new Date().toLocaleDateString('ja-JP')}`
    },
    reviews
  }

  saveJSON(slug, 'reviews.json', reviewData)
  console.log(`[STEP3] 完了: ${reviews.length}件取得`)

  updateScraperNotes(source, `${reviews.length}件取得成功`, true)
}

async function extractJalan(page: Page, oneYearAgo: Date): Promise<Review[]> {
  const reviews: Review[] = []
  let pageNum = 1

  while (true) {
    console.log(`[STEP3] じゃらん ${pageNum}ページ目を取得中...`)

    const cards = await page.$$('.jlnpc-kuchikomiCassette')
    if (cards.length === 0) break

    let reachedLimit = false

    for (const card of cards) {
      const dateText = await card.$eval(
        '.jlnpc-kuchikomiCassette__postDate',
        el => el.textContent?.trim() ?? ''
      ).catch(() => '')

      const reviewDate = parseDateJalan(dateText)
      if (reviewDate && reviewDate < oneYearAgo) {
        console.log(`[STEP3] 12ヶ月以上前の口コミに到達 (${dateText})。停止します。`)
        reachedLimit = true
        break
      }

      const body = await card.$eval(
        '.jlnpc-kuchikomiCassette__postBody',
        el => el.textContent?.trim() ?? ''
      ).catch(() => '')

      if (!body || body.length < 10) continue

      const ratingText = await card.$eval(
        '.jlnpc-kuchikomiCassette__totalRate',
        el => el.textContent?.trim() ?? ''
      ).catch(() => '')

      const user = await card.$eval(
        '.jlnpc-kuchikomiCassette__userName',
        el => el.textContent?.trim() ?? ''
      ).catch(() => null)

      reviews.push({
        id: reviews.length + 1,
        rating: ratingText ? Number(ratingText) : null,
        user,
        date: dateText || null,
        review: body
      })
    }

    if (reachedLimit) break

    const nextBtn = await page.$('.jlnpc-pagination__next:not(.is-disabled)')
    if (!nextBtn) break

    await nextBtn.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    pageNum++
  }

  return reviews
}

async function extractRakuten(page: Page, oneYearAgo: Date): Promise<Review[]> {
  const reviews: Review[] = []
  let pageNum = 1

  while (true) {
    console.log(`[STEP3] 楽天トラベル ${pageNum}ページ目を取得中...`)

    const blocks = await page.$$('[data-testid="reviewTitleDescription-description"]')
    if (blocks.length === 0) break

    let reachedLimit = false

    for (const block of blocks) {
      const card = await block.evaluateHandle(el => el.closest('[data-id]'))

      // 宿泊月: <span data-testid="Review.Common.StayMonth"><span>2026年3月</span>宿泊</span>
      const dateText = await page.evaluate(el => {
        const dateEl = (el as Element)?.querySelector('[data-testid="Review.Common.StayMonth"] span')
        return dateEl?.textContent?.trim() ?? ''
      }, card).catch(() => '')

      const reviewDate = parseDateRakuten(dateText)
      if (reviewDate && reviewDate < oneYearAgo) {
        console.log(`[STEP3] 12ヶ月以上前の口コミに到達 (${dateText})。停止します。`)
        reachedLimit = true
        break
      }

      const text = await block.evaluate(el => el.textContent?.trim() ?? '')
      if (!text || text.length < 10) continue

      const ratingText = await page.evaluate(el => {
        const ratingEl = (el as Element)?.querySelector('[data-testid="displayed-rating"]')
        return ratingEl?.textContent?.trim() ?? ''
      }, card).catch(() => '')

      const user = await page.evaluate(el => {
        const userEl = (el as Element)?.querySelector('[data-testid="userProfile-user-nickname"]')
        return userEl?.textContent?.trim() ?? null
      }, card).catch(() => null)

      reviews.push({
        id: reviews.length + 1,
        rating: ratingText ? Number(ratingText) : null,
        user,
        date: dateText || null,
        review: text
      })
    }

    if (reachedLimit) break

    // 「もっと見る」リンクの href を取得して次ページへ遷移
    const nextHref = await page.evaluate((): string | null => {
      const btn = document.querySelector('[data-testid="LoadMoreButton-seeMore"]')
      if (!btn) return null
      const link = btn.closest('a')
      return link?.href ?? null
    })
    if (!nextHref) break

    await page.goto(nextHref, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1500)
    pageNum++
  }

  return reviews
}

async function extractGoogle(page: Page, oneYearAgo: Date): Promise<Review[]> {
  const reviews: Review[] = []
  let scrollCount = 0
  const maxScrolls = 50

  while (scrollCount < maxScrolls) {
    console.log(`[STEP3] Google ${scrollCount + 1}回目のスクロール...`)

    const blocks = await page.$$('[jsname="NwoMSd"]')
    let reachedLimit = false

    for (const block of blocks) {
      const id = reviews.length + 1
      if (reviews.find(r => r.id === id)) continue

      const container = await block.evaluateHandle(el => el.closest('.Svr5cf'))

      const dateText = await page.evaluate(el => {
        const dateEl = (el as Element)?.querySelector('.rsqaWe')
        return dateEl?.textContent?.trim() ?? ''
      }, container).catch(() => '')

      const reviewDate = parseDateGoogle(dateText)
      if (reviewDate && reviewDate < oneYearAgo) {
        console.log(`[STEP3] 12ヶ月以上前の口コミに到達 (${dateText})。停止します。`)
        reachedLimit = true
        break
      }

      let text = await block.evaluate(el => (el as HTMLElement).innerText?.trim() ?? '')
      text = text.replace(/Google による翻訳.*/g, '').replace(/原文.*/g, '').trim()
      if (text.length < 10) continue

      const ratingText = await page.evaluate(el => {
        const ratingEl = (el as Element)?.querySelector('[aria-label*="つ星"]')
        return ratingEl?.getAttribute('aria-label') ?? ''
      }, container).catch(() => '')

      const ratingMatch = ratingText.match(/[0-9.]+/)
      const user = await page.evaluate(el => {
        const userEl = (el as Element)?.querySelector('.d4r55')
        return (userEl as HTMLElement)?.innerText?.trim() ?? null
      }, container).catch(() => null)

      reviews.push({
        id: reviews.length + 1,
        rating: ratingMatch ? Number(ratingMatch[0]) : null,
        user,
        date: dateText || null,
        review: text
      })
    }

    if (reachedLimit) break

    const prevCount = reviews.length
    await page.evaluate(() => window.scrollBy(0, 1000))
    await page.waitForTimeout(1500)

    const newCount = (await page.$$('[jsname="NwoMSd"]')).length
    if (newCount === prevCount) break

    scrollCount++
  }

  return reviews
}

function parseDateJalan(dateStr: string): Date | null {
  const m = dateStr.match(/(\d{4})[年/](\d{1,2})[月/](\d{1,2})/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function parseDateRakuten(dateStr: string): Date | null {
  const m = dateStr.match(/(\d{4})年(\d{1,2})月/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, 1)
}

function parseDateGoogle(dateStr: string): Date | null {
  const now = new Date()
  if (dateStr.includes('か月前')) {
    const m = dateStr.match(/(\d+)\s*か月前/)
    if (m) {
      const d = new Date(now)
      d.setMonth(d.getMonth() - Number(m[1]))
      return d
    }
  }
  if (dateStr.includes('週間前')) {
    const m = dateStr.match(/(\d+)\s*週間前/)
    if (m) {
      const d = new Date(now)
      d.setDate(d.getDate() - Number(m[1]) * 7)
      return d
    }
  }
  if (dateStr.includes('日前')) {
    const m = dateStr.match(/(\d+)\s*日前/)
    if (m) {
      const d = new Date(now)
      d.setDate(d.getDate() - Number(m[1]))
      return d
    }
  }
  if (dateStr.includes('年前')) {
    const m = dateStr.match(/(\d+)\s*年前/)
    if (m) {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - Number(m[1]))
      return d
    }
  }
  const ym = dateStr.match(/(\d{4})年(\d{1,2})月/)
  if (ym) return new Date(Number(ym[1]), Number(ym[2]) - 1, 1)
  return null
}

function updateScraperNotes(source: string, message: string, success: boolean): void {
  const notesPath = 'docs/scraper-notes.md'
  if (!fs.existsSync('docs')) fs.mkdirSync('docs')

  const timestamp = new Date().toLocaleString('ja-JP')
  const status = success ? '✅ 成功' : '❌ 失敗'
  const entry = `\n### ${timestamp} — ${status}\n${message}\n`

  const sourceMap: Record<string, string> = {
    jalan: '## じゃらん (jalan.net)',
    rakuten: '## 楽天トラベル (travel.rakuten.co.jp)',
    google: '## Google Travel (google.com)'
  }

  if (!fs.existsSync(notesPath)) {
    fs.writeFileSync(notesPath, `# スクレイパー学習メモ\n\n## じゃらん (jalan.net)\n\n## 楽天トラベル (travel.rakuten.co.jp)\n\n## Google Travel (google.com)\n`)
  }

  let content = fs.readFileSync(notesPath, 'utf-8')
  const marker = sourceMap[source]
  if (marker) {
    content = content.replace(marker, marker + entry)
    fs.writeFileSync(notesPath, content)
  }
}
