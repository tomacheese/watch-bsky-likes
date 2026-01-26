# CLAUDE.md

## 目的
このドキュメントは、Claude Code の作業方針とプロジェクト固有のルールを示します。

## 判断記録のルール
Claude Code が重要な決定を行った場合、以下の内容を記録してください。
- 判断内容の要約
- 検討した代替案
- 採用しなかった案とその理由
- 前提条件・仮定・不確実性
- 他エージェントによるレビュー可否

## プロジェクト概要
- **目的**: Bluesky ユーザーのいいねを監視し、画像付きの投稿を Discord に通知する。
- **主な機能**:
  - Bluesky API を使用したいいねの取得。
  - 画像投稿の判定。
  - Discord (Webhook/Bot) への通知。
  - 重複通知防止とキャッシュ管理。

## 重要ルール
- **会話言語**: 日本語
- **コミット規約**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (description は日本語)
- **コード内コメント**: 日本語
- **エラーメッセージ**: 英語

## 環境のルール
- **ブランチ命名**: [Conventional Branch](https://conventional-branch.github.io) (`feat/`, `fix/` などの短縮形を使用)
- **GitHub リポジトリ調査**: 調査が必要な場合は一時ディレクトリに clone して行う。
- **Renovate**: Renovate が作成した PR に対して追加コミットや更新を行わない。

## Git Worktree
Git Worktree を使用する場合は、以下の構成に従ってください。
- `.bare/`
- `<branch-name>/`

## コード改修時のルール
- 日本語と英数字の間には半角スペースを挿入する。
- エラーメッセージに絵文字が含まれている場合は、新しいメッセージでも絵文字を使用する。
- TypeScript の `skipLibCheck` による回避は禁止。
- 関数やインターフェースには日本語で docstring を記載する。

## 相談ルール
- **Codex CLI**: 実装レビュー、局所設計、整合性確認。
- **Gemini CLI**: 外部仕様、最新情報確認。
- 指摘を受けた場合は黙殺せず、必ず対応方針を検討する。

## 開発コマンド
```bash
# 依存関係のインストール
pnpm install

# 実行
pnpm start

# 開発モード
pnpm dev

# 静的解析
pnpm lint
pnpm lint:eslint
pnpm lint:prettier
pnpm lint:tsc

# 自動修正
pnpm fix
pnpm fix:eslint
pnpm fix:prettier

# スキーマ生成
pnpm generate-schema
```

## アーキテクチャと主要ファイル
- **src/main.ts**: メインロジック。設定の読み込み、通知処理のループ。
- **src/bsky.ts**: Bluesky API との通信、キャッシュ処理。
- **src/config.ts**: 設定クラスの定義とバリデーション。
- **src/notified.ts**: 通知済みポストの永続化管理。
- **data/**: 設定、通知済みリスト、キャッシュが保存されるディレクトリ。

## 実装パターン
- `ConfigFramework` を使用した設定管理。
- `Logger` を使用したログ出力。
- `Discord` クラスを使用した通知。

## テスト
- テストは現状未実装だが、必要に応じて `vitest` 等の導入を検討する。

## ドキュメント更新ルール
- 設定変更時は `src/config.ts` の `IConfiguration` インターフェースを更新し、`pnpm generate-schema` を実行する。

## 作業チェックリスト

### 新規改修時
1. プロジェクトを理解する。
2. 適切なブランチ（最新の remote に基づく）を作成する。
3. `pnpm install` で依存関係を更新する。

### コミット・プッシュ前
1. Conventional Commits に従っているか確認。
2. 秘密情報が混入していないか確認。
3. `pnpm lint` でエラーがないか確認。
4. 動作確認を行う。

### PR 作成前
1. ユーザーの依頼があるか確認。
2. 秘密情報の混入とコンフリクトを確認。

### PR 作成後
1. コンフリクトの有無を確認。
2. PR 本文が最新状態を反映しているか確認。
3. CI (`gh pr checks`) の結果を確認。
4. レビュー指摘に対応する。

## リポジトリ固有
- 監視対象ユーザー (`hiratake.dev`) が `src/main.ts` に直接記述されているため、変更が必要な場合はそこを編集する。
- `data/` ディレクトリが存在しない場合は作成される必要がある。
