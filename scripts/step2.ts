import Anthropic from '@anthropic-ai/sdk'
import { FacilityInput, readPrompt, saveJSON } from './utils'
import { scrapePages } from './scraper'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function runStep2(slug: string, input: FacilityInput): Promise<void> {
  console.log('[STEP2] 施設情報抽出を開始します...')

  // ① Playwrightでスクレイピング
  const urls = [input.facility.official_url, ...input.facility.ota_urls]
  console.log(`[STEP2] ${urls.length}件のURLをスクレイピング中...`)
  const pages = await scrapePages(urls)

  // ② スクレイピング結果をテキストにまとめる
  const scrapedText = pages.map(p => {
    if (p.error) return `## ${p.url}\nFETCH_ERROR: ${p.error}\n`
    return `## ${p.url}\n${p.text}\n`
  }).join('\n---\n')

  // ③ プロンプト構築（web_searchなし・JSON変換のみ）
  const systemPrompt = readPrompt('step2_system.md')
  const userTemplate = readPrompt('step2_user.md')

  const otaList = input.facility.ota_urls.join('\n')
  const userPrompt = userTemplate
    .replace('{{FACILITY_NAME}}', input.facility.name)
    .replace('{{OFFICIAL_URL}}', input.facility.official_url)
    .replace('{{OTA_URLS}}', otaList)
    .replace('{{SCRAPED_CONTENT}}', scrapedText)

  console.log('[STEP2] Claude API を呼び出し中（JSON変換のみ）...')

  // ④ web_searchなしで呼び出す
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })

  const textContent = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')

  // JSONを抽出（コードブロックあり・なし両対応）
  const jsonMatch =
    textContent.match(/```json\s*([\s\S]*?)```/) ||
    textContent.match(/(\{[\s\S]*\})/)

  if (!jsonMatch) {
    throw new Error('[STEP2] レスポンスからJSONを抽出できませんでした\n' + textContent.slice(0, 500))
  }

  const jsonStr = jsonMatch[1] ?? jsonMatch[0]

  let facilityData: unknown
  try {
    facilityData = JSON.parse(jsonStr)
  } catch (e) {
    throw new Error(`[STEP2] JSONのパースに失敗しました: ${e}\n${jsonStr.slice(0, 300)}`)
  }

  saveJSON(slug, 'facility.json', facilityData)
  console.log('[STEP2] 完了')
}
