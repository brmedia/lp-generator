import * as fs from 'fs'
import * as path from 'path'
import { ensureDir, saveJSON, fileExists, createOutputSlug } from './utils'
import { runStep3 } from './step3'
import { runStep4 } from './step4'

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  const facilityIndex = args.indexOf('--facility')
  if (facilityIndex !== -1 && args[facilityIndex + 1]) {
    const slug = args[facilityIndex + 1]
    const stepIndex = args.indexOf('--step')
    const targetStep = stepIndex !== -1 ? Number(args[stepIndex + 1]) : null

    console.log(`\n========================================`)
    console.log(`施設スラッグ: ${slug}`)
    if (targetStep) console.log(`実行STEP: ${targetStep}`)
    console.log(`========================================\n`)

    if (!targetStep || targetStep === 3) {
      if (fileExists(slug, 'reviews.json') && targetStep === null) {
        console.log('[STEP3] reviews.json が既に存在するためスキップ（--step 3 で強制実行）')
      } else {
        const reviewUrlIndex = args.indexOf('--review-url')
        const reviewUrl = reviewUrlIndex !== -1 && args[reviewUrlIndex + 1]
          ? args[reviewUrlIndex + 1]
          : getFacilityReviewUrl(slug)
        await runStep3(slug, reviewUrl)
      }
    }

    if (!targetStep || targetStep === 4) {
      await runStep4(slug)
      console.log('\n========================================')
      console.log('STEP4: 以下をClaude Codeに伝えてください')
      console.log('========================================')
      console.log(`\nfacilities/${slug}/step4_prompt.md を読んで`)
      console.log(`構成案を生成し、facilities/${slug}/structure.md に保存してください\n`)
    }

    console.log('\n========================================')
    console.log('処理完了')
    console.log('========================================\n')
    return
  }

  console.log('使用方法: npm run generate -- --facility {スラッグ} [--step 3|4]')
}

function getFacilityReviewUrl(slug: string): string {
  const inputPath = path.join('facilities', slug, 'input.yaml')
  if (fs.existsSync(inputPath)) {
    const yaml = require('js-yaml')
    const content = fs.readFileSync(inputPath, 'utf-8')
    const data = yaml.load(content) as { facility: { review_url: string } }
    return data.facility.review_url
  }
  throw new Error(`input.yaml が見つかりません: ${inputPath}`)
}

main().catch(err => {
  console.error('\n[ERROR]', err.message)
  process.exit(1)
})
