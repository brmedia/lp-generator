import * as fs from 'fs'
import * as path from 'path'
import { readPrompt, saveMD } from './utils'

export async function runStep4(slug: string): Promise<void> {
  console.log('[STEP4] 構成案プロンプトを生成します...')

  const facilityPath = path.join('facilities', slug, 'facility.json')
  const reviewPath = path.join('facilities', slug, 'reviews.json')

  if (!fs.existsSync(facilityPath)) {
    throw new Error('[STEP4] facility.json が見つかりません')
  }
  if (!fs.existsSync(reviewPath)) {
    throw new Error('[STEP4] reviews.json が見つかりません')
  }

  const facilityJson = fs.readFileSync(facilityPath, 'utf-8')
  const reviewJson = fs.readFileSync(reviewPath, 'utf-8')

  const template = readPrompt('step4_structure.md')
  const prompt = template
    .replace('{{FACILITY_JSON}}', facilityJson)
    .replace('{{REVIEW_JSON}}', reviewJson)

  saveMD(slug, 'step4_prompt.md', prompt)

  console.log('[STEP4] step4_prompt.md を生成しました')
  console.log('[STEP4] 以下をClaude Codeに伝えてください:')
  console.log(`facilities/${slug}/step4_prompt.md を読んで構成案を生成し、facilities/${slug}/structure.md に保存してください`)
}
