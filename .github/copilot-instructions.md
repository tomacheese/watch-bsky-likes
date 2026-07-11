# GitHub Copilot Instructions

GitHub Copilot のコードレビュー向け指示です。このリポジトリの PR をレビューする際の観点をまとめています。

## プロジェクト概要

Bluesky ユーザーのいいねを監視し、いいねされた画像投稿を Discord へ通知する TypeScript / Node.js 製ツールです。設定は `data/config.json`、通知済み管理は `data/notified.json`、投稿キャッシュは `data/post_cache/` に保存されます。

## レビュー時に強制すべき規約

lint / formatter で実際に強制されているため、これらに反する変更は指摘すること。

- **フォーマット**: Prettier（`pnpm lint:prettier`）。整形崩れは指摘する。
- **静的解析**: ESLint（`@book000/eslint-config`、standard ベース）。
- **型チェック**: `tsc`（`pnpm lint:tsc`）。`skipLibCheck` で型エラーを回避する変更は不可。
- **命名**: クラスは PascalCase、メソッド・変数は camelCase。
- **日本語と英数字の間には半角スペースを入れる**（コメント・ドキュメント）。
- **コメントは日本語、エラーメッセージは英語**。エラーメッセージは既存コードに倣い先頭に絵文字を付ける（例: `❌`, `💡`）。
- **docstring は原則日本語**。ただし interface のプロパティ名や外部 API 仕様に沿う箇所は英語可。

## 重点的に確認すべき点

- **エラーハンドリング**: 外部 API（Bluesky）や Discord 通知のレスポンスが想定外（embed 種別の違い、欠損フィールド、空配列など）でもクラッシュしないか。過去に `isImagePost` が画像以外の embed 種別で落ちる不具合があったため、`src/bsky.ts` の型ガード・分岐は特に注意する。
- **機密情報**: `data/config.json` には Discord トークン / Webhook URL が含まれる。これらの値やログ出力に機密が混入する変更、`data/` 配下をコミット対象にする変更は指摘する。
- **設定スキーマの整合**: `src/config.ts` の `IConfiguration` を変更した場合、`pnpm generate-schema` によるスキーマ再生成が前提になっているか。インターフェース名を変えた場合は `package.json` の `generate-schema` スクリプトの参照名も合わせて更新されているか。
- **重複通知防止**: 通知済み判定（`src/notified.ts`）を経由せずに Discord 送信する変更は、重複通知を招くため確認する。

## フラグすべきでない既知パターン（誤検知しやすい箇所）

- 監視対象ユーザーが `src/main.ts` にハンドル名でハードコードされていること（例: `'hiratake.dev'`）は既知の仕様。設定ファイル化は将来課題であり、ハードコード自体を不具合として指摘しない。
- 自動テストが未実装であること自体は既知。テスト追加の提案は歓迎だが「テストが無い」ことをブロッキング指摘にはしない。
- `console.log` による標準出力ログは通知処理の進捗表示として意図的に使われている箇所がある。
