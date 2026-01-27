# GEMINI.md

## 目的
このドキュメントは、Gemini CLI 向けのコンテキストと作業方針を定義します。

## 出力スタイル
- **言語**: 日本語（専門用語や識別子以外）。
- **トーン**: プロフェッショナルかつ簡潔な CLI スタイル。
- **形式**: GitHub Flavored Markdown。

## 共通ルール
- **会話**: 日本語。
- **コミット**: Conventional Commits (日本語の description)。
- **間隔**: 日本語と英数字の間に半角スペース。

## プロジェクト概要
- **目的**: Bluesky ユーザーのいいねを監視し、画像付きの投稿を Discord に通知する。
- **技術スタック**: TypeScript, Node.js, pnpm, axios, @book000/node-utils。

## コーディング規約
- **コメント**: 日本語。
- **エラーメッセージ**: 英語（絵文字を活用）。
- **フォーマット**: Prettier / ESLint。
- **docstring**: 原則として日本語で記載（ただし interface のプロパティや外部 API 仕様に合わせる必要がある場合は英語も可）。

## 開発コマンド
```bash
# 依存関係
pnpm install

# 実行
pnpm start
pnpm dev

# チェック
pnpm lint
pnpm fix

# スキーマ
pnpm generate-schema
```

## 注意事項
- **セキュリティ**: API トークンや Webhook URL をコミットしない。`.gitignore` を遵守する。
- **既存優先**: 既存のディレクトリ構造やコーディングパターンを尊重する。
- **型チェック**: `skipLibCheck` は使用しない。

## リポジトリ固有
- 監視対象は `src/main.ts` で定義されている。
- 通知データとキャッシュは `data/` に保存される。
- `pnpm` をパッケージマネージャーとして使用する。
