# LP Generator

## 目的
宿泊施設のLP制作を自動化するCLIツール。
input.yaml を作成して npm run generate を叩くだけで
施設情報JSON・口コミJSON・構成案MDが生成される。

## 実行コマンド
npm run generate -- --facility {施設スラッグ}
npm run generate -- --facility hatoya-zuihoukaku --step 2

## 技術スタック
- TypeScript (Node.js 20+)
- @anthropic-ai/sdk
- playwright
- js-yaml
- dotenv

## 開発ルール
- TypeScriptの型を必ず付ける（any禁止）
- エラーはthrowしてrun.tsで一元ハンドリング
- ログは [STEP2] [STEP3] [STEP4] プレフィックスで出力
- 成功済みSTEPのファイルが存在する場合は再実行時スキップ

## 起動フォーマット

ユーザーが以下の形式で入力したらSTEP3→STEP4を順番に実行する。

```
施設情報の構成案作成を行ってください
施設名：{施設名}
口コミ抽出ページURL：{URL}
facility.json：
{JSONをここに貼り付け}
```

受け取ったら以下を実行する：
1. createOutputSlug(施設名) でスラッグを生成
2. facilities/{スラッグ}/ を作成
3. facility.json を保存
4. runStep3(slug, reviewUrl) を実行 → reviews.json を生成
5. runStep4(slug) を実行 → structure.md を生成
6. 完了を報告

## STEP4の実行方法

step4_prompt.md が生成されたら、Claude Code自身がそのファイルを読んで
構成案を生成してstructure.mdに保存する。

手順:
1. facilities/{スラッグ}/step4_prompt.md を読む
2. プロンプトの指示に従って構成案を生成する
3. 生成した構成案を facilities/{スラッグ}/structure.md に保存する
4. 完了を報告する

Claude APIは使わない。

## 口コミ取得ルール
- 取得対象：直近365日分（実行日から365日以内）
- 12ヶ月以上前の口コミが出現したら停止
- docs/scraper-notes.md を実行前に読み、実行後に更新する
