# GitHub Copilot Instructions

## プロジェクト概要
- **目的**: Bluesky ユーザーのいいねを監視し、画像付きの投稿を Discord に通知するツール。
- **主な機能**:
  - 指定した Bluesky ユーザーのいいね一覧を定期的に取得。
  - いいねされた投稿が画像付きであるか判定。
  - 未通知の画像投稿を Discord Webhook または Bot を通じて通知。
  - 通知済みの投稿を `data/notified.json` で管理し、重複通知を防止。
  - 投稿内容のキャッシュを `data/post_cache/` に保存。
- **対象ユーザー**: 自分のいいねを Discord に集約したい Bluesky ユーザー。

## 共通ルール
- 会話は日本語で行う。
- コミットメッセージとプルリクエストは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。
  - `<type>(<scope>): <description>` 形式。
  - `<description>` は日本語で記載。
- 日本語と英数字の間には半角スペースを入れる。

## 技術スタック
- 言語: TypeScript
- 実行環境: Node.js
- パッケージマネージャー: pnpm
- 主要ライブラリ:
  - `axios`: API リクエスト
  - `@book000/node-utils`: コンフィグ管理、Discord 通知、ロガー

## コーディング規約
- **言語**: TypeScript
- **フォーマット**: Prettier
- **静的解析**: ESLint
- **命名規則**:
  - クラス名: PascalCase
  - メソッド・変数名: camelCase
- **TypeScript**: TypeScript の `skipLibCheck` を有効にしないこと。
- **ドキュメント**: 関数やクラスには JSDoc (docstring) を原則として日本語で記載する（設定項目やインターフェースのプロパティなど、英語の方が自然な場合は英語を使用してよい）。
- **エラーメッセージ**: 英語で記載し、先頭に適切な絵文字を付ける（既存コードに倣う）。

## 開発コマンド
```bash
# 依存関係のインストール
pnpm install

# 実行
pnpm start

# 開発モード（ウォッチモード）
pnpm dev

# リンターの実行
pnpm lint

# コードの自動修正
pnpm fix

# 設定ファイルの JSON Schema 生成
pnpm generate-schema
```

## テスト方針
- 現在、テストコードは実装されていない。
- 新しく機能を追加する場合は、必要に応じてテストコードを追加することを検討する。

## セキュリティ / 機密情報
- `data/config.json` には Discord のトークンや Webhook URL が含まれるため、Git にコミットしてはならない。
- ログに認証情報や個人情報を出力しないように注意する。

## ドキュメント更新
- 機能変更時は `README.md` を更新する。
- 設定項目の変更時は `src/config.ts` の `IConfiguration` インターフェースを更新し、その後 `pnpm generate-schema` を実行する（インターフェース名を変更した場合は、`package.json` の `generate-schema` スクリプトが参照するインターフェース名もあわせて更新すること）。

## リポジトリ固有
- 監視対象のユーザーは `src/main.ts` にハードコードされている（将来的に設定ファイルへ移行する可能性がある）。
- データ保存先は `data/` ディレクトリ以下に集約されている。
