import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as dotenv from 'dotenv'

dotenv.config()

export interface FacilityInput {
  facility: {
    name: string
    official_url: string
    ota_urls: string[]
    review_url: string
    review_source: 'google' | 'jalan' | 'rakuten'
    output_dir?: string
  }
}

export function loadInput(slug: string): FacilityInput {
  const filePath = path.join('facilities', slug, 'input.yaml')
  const content = fs.readFileSync(filePath, 'utf-8')
  return yaml.load(content) as FacilityInput
}

export function ensureDir(slug: string): void {
  const dir = path.join('facilities', slug)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function saveJSON(slug: string, filename: string, data: unknown): void {
  ensureDir(slug)
  const filePath = path.join('facilities', slug, filename)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`[SAVED] ${filePath}`)
}

export function saveMD(slug: string, filename: string, content: string): void {
  ensureDir(slug)
  const filePath = path.join('facilities', slug, filename)
  fs.writeFileSync(filePath, content, 'utf-8')
  console.log(`[SAVED] ${filePath}`)
}

export function fileExists(slug: string, filename: string): boolean {
  return fs.existsSync(path.join('facilities', slug, filename))
}

export function readPrompt(filename: string): string {
  return fs.readFileSync(path.join('prompts', filename), 'utf-8')
}

export function createOutputSlug(name: string): string {
  const now = new Date()
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0')
  const safeName = name.replace(/[\s　/\\:*?"<>|]/g, '')
  return `${safeName}-${ts}`
}
