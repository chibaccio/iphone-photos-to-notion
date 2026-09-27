# iphone-photos-to-notion

iPhoneで撮影した前日の写真を、iOSショートカット経由で受信し、Notion File Upload APIを用いてNotionライフログ（日記）ページのトグル「Review the same days」の直下へ画像ブロックとして自動追加するGoogle Apps Script（GAS）プロジェクトです。

## 本番デプロイ情報（固定エンドポイント）
- **リポジトリ**: [chibaccio/iphone-photos-to-notion](https://github.com/chibaccio/iphone-photos-to-notion)
- **GASプロジェクト**: [iphone-photos-to-notion (GASエディタ)](https://script.google.com/d/1AGdr8-5P0D-8LCluq5s81_16aQJwhcNCh5hE8Gcdnhf8YTOJ7D_hW4dt/edit?usp=drivesdk)
- **スクリプトID**: `1AGdr8-5P0D-8LCluq5s81_16aQJwhcNCh5hE8Gcdnhf8YTOJ7D_hW4dt`
- **デプロイID**: `AKfycbxsYCQfSlZr0B3XJKNVbP-_htAQOzHt-GgcBF-frIyoRhACjDWMBmv1yHwCyltZVyMw`
- **WebアプリURL**: `https://script.google.com/macros/s/AKfycbxsYCQfSlZr0B3XJKNVbP-_htAQOzHt-GgcBF-frIyoRhACjDWMBmv1yHwCyltZVyMw/exec`

> **Note**: 上記のWebアプリURLは**本番固定エンドポイント**です。今後のコード更新時もデプロイ管理によりURLは変わりません。

## 特徴
- **GoogleフォトAPIの制限を完全回避**: 写真アプリ内の「前日に撮影した写真」をiOSショートカットで直接抽出し、Base64形式でGASへPOST送信。
- **Notion File Upload API対応**: Notion公式の最新Direct File Upload API（`2026-03-11`）を使用して画像をNotion内部ストレージへ直接アップロード。
- **Notion 2026年仕様クエリ対応**: `data_sources/{id}/query` エンドポイントに対応（レガシー `databases/{id}/query` へのフォールバック機構付き）。
- **トグル「Review the same days」直下への配置**: ページ末尾ではなく、「Review the same days」トグルの直下（本文の日記見出しの前）へ順番通りに挿入。すでに写真がある場合はその写真群の末尾に連続して追加。
- **共有シークレット認証**: 不正アクセスやスパム投稿を防ぐため、リクエスト時に独自のAPIキー（`AUTH_SECRET_KEY`）を照合。
- **単一画像送信・一括送信両対応**: ショートカットの「各項目を繰り返す」による1枚ずつの送信、配列による一括送信の双方に対応。日付省略時は自動で「昨日（JST）」を判定。

## スクリプトプロパティ（GAS環境変数）
| キー名 | 必須 | 説明 | 設定例 |
|---|---|---|---|
| `NOTION_API_KEY` または `NOTION_TOKEN` | ○ | Notionインテグレーションシークレット | `ntn_...` |
| `AUTH_SECRET_KEY` | ○ | iPhoneショートカットと共有する合言葉 | `photo_sync_secret_2026` |
| `NOTION_DATABASE_ID` | 任意 | 日記DBのID（未設定時はデフォルト値を使用） | `7f0bc47e982b49a3a2edebeede8cfc4e` |
| `NOTION_DATE_PROP` | 任意 | 日付プロパティ名（未設定時は `Date`） | `Date` |

## iPhoneショートカット構築ガイド

### 1. アクション構成
1. **日付の取得**:
   - `現在の日付` を取得
   - `日付を調整`: `1日を引く`
   - `日付をフォーマット`: カスタム形式 `yyyy-MM-dd`（例: 2026-09-27）
2. **写真の抽出**:
   - `写真を検索`:
     - 次のすべてが真:
       - `撮影日` が `[調整された日付 00:00:00]` より後
       - `撮影日` が `[調整された日付 23:59:59]` より前
     - 並び順: `日付の古い順`
     - 制限: 最大 10〜15 枚
3. **繰り返しループ**:
   - `各項目を繰り返す`（[写真]）
     - `Base64エンコード`: 入力 `[繰り返しの項目]`（改行なし）
     - `辞書`:
       - `apiKey`: `AUTH_SECRET_KEYで設定した文字列`
       - `image`: `[Base64エンコード済みテキスト]`
       - `filename`: `[繰り返しの項目 の ファイル名]`
       - `date`: `[フォーマット済み日付]`（省略可能）
     - `URLの内容を取得`:
       - URL: `https://script.google.com/macros/s/AKfycbxsYCQfSlZr0B3XJKNVbP-_htAQOzHt-GgcBF-frIyoRhACjDWMBmv1yHwCyltZVyMw/exec`
       - 方法: `POST`
       - ヘッダー: `Content-Type: application/json`
       - 要求本文: `JSON`（作成した辞書）
   - `繰り返しの終了`

## アーキテクチャフロー
```text
[ iPhone写真アプリ ]
       │ （前日の写真を抽出）
       ▼
[ iOS ショートカット ] ──(Base64 POST)──▶ [ Google Apps Script (Webhook) ]
                                                   │
                                                   ├─ 1. APIキー検証
                                                   ├─ 2. Notion DBから前日の日記PageID取得
                                                   ├─ 3. 「Review the same days」ブロック特定
                                                   ├─ 4. Notion File Upload API でアップロード
                                                   └─ 5. トグル直下へ画像ブロックを挿入
                                                           │
                                                           ▼
                                                [ Notion ライフログページ ]
```
