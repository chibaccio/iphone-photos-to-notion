# iphone-photos-to-notion

iPhoneで撮影した前日の写真を、iOSショートカット経由で受信し、Notion File Upload APIを用いてNotionライフログ（日記）ページのトグル「Review the same days」の直下へ画像ブロックとして自動追加するGoogle Apps Script（GAS）プロジェクトです。

## 本番デプロイ情報
- **GASプロジェクト**: [iphone-photos-to-notion (GASエディタ)](https://script.google.com/d/1AGdr8-5P0D-8LCluq5s81_16aQJwhcNCh5hE8Gcdnhf8YTOJ7D_hW4dt/edit?usp=drivesdk)
- **スクリプトID**: `1AGdr8-5P0D-8LCluq5s81_16aQJwhcNCh5hE8Gcdnhf8YTOJ7D_hW4dt`
- **デプロイID**: `AKfycbxsYCQfSlZr0B3XJKNVbP-_htAQOzHt-GgcBF-frIyoRhACjDWMBmv1yHwCyltZVyMw`
- **WebアプリURL**: `https://script.google.com/macros/s/AKfycbxsYCQfSlZr0B3XJKNVbP-_htAQOzHt-GgcBF-frIyoRhACjDWMBmv1yHwCyltZVyMw/exec`

## 特徴
- **GoogleフォトAPIの制限を回避**: iPhoneの標準ショートカットで「昨日の写真」を抽出し直接GASへPOST送信。
- **Notion File Upload API対応**: Notion公式の最新Direct File Upload API（`2026-03-11`）を使用して画像をアップロード。
- **Notion 2026年仕様クエリ対応**: `data_sources/{id}/query` エンドポイントに対応し、レガシーフォールバックも完備。
- **トグル「Review the same days」直下への挿入**: ページ末尾ではなく、「Review the same days」トグルの直下（本文の日記見出しの前）へ順番通りに挿入。すでに写真がある場合はその写真群の末尾に連続して追加。
- **共有シークレット認証**: 不正アクセスやスパム投稿を防ぐため、リクエスト時に独自のAPIキー（`AUTH_SECRET_KEY`）を照合。
- **単一画像送信対応**: ショートカット内の1枚ごとのPOSTにも対応。日付省略時は自動で「昨日」を判定。

## スクリプトプロパティ
| キー名 | 必須 | 説明 | 例 |
|---|---|---|---|
| `NOTION_API_KEY` または `NOTION_TOKEN` | ○ | Notionインテグレーションシークレット | `ntn_...` |
| `AUTH_SECRET_KEY` | ○ | iPhoneショートカットと共有する合言葉 | `photo_sync_secret_2026` |
| `NOTION_DATABASE_ID` | 任意 | 日記DBのID（未設定時はデフォルト値を使用） | `7f0bc47e982b49a3a2edebeede8cfc4e` |
| `NOTION_DATE_PROP` | 任意 | 日付プロパティ名（未設定時は `Date`） | `Date` |

## iPhoneショートカット設定
- POST送信先URL: `https://script.google.com/macros/s/AKfycbxsYCQfSlZr0B3XJKNVbP-_htAQOzHt-GgcBF-frIyoRhACjDWMBmv1yHwCyltZVyMw/exec`
- 送信JSON形式:
  ```json
  {
    "apiKey": "AUTH_SECRET_KEYで設定した値",
    "image": "<base64 encoded string>",
    "filename": "IMG_1234.jpg"
  }
  ```
