/**
 * iPhone写真自動連携 Webhook
 * 
 * 役割:
 * iPhoneショートカットからPOSTされた写真データ（Base64）を受信し、
 * Notion File Upload API を使用してアップロードの上、
 * 対象日の日記ページの本文末尾へ画像ブロックとして追加します。
 * （※プロパティ「本日の一枚」には触れず、本文内へ追加します）
 */

const CONFIG = {
  DEFAULT_DATABASE_ID: '7f0bc47e982b49a3a2edebeede8cfc4e',
  DEFAULT_DATA_SOURCE_ID: 'c01029af-7268-4e1b-9ae8-c36317e02b6b',
  DEFAULT_DATE_PROP: 'Date',
  NOTION_VERSION: '2026-03-11',
  TIMEZONE: 'Asia/Tokyo',
  MAX_IMAGES: 15
};

function getNotionToken() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('NOTION_API_KEY') || props.getProperty('NOTION_TOKEN');
}

function getDatabaseId() {
  return PropertiesService.getScriptProperties().getProperty('NOTION_DATABASE_ID') || CONFIG.DEFAULT_DATABASE_ID;
}

function getDatePropName() {
  return PropertiesService.getScriptProperties().getProperty('NOTION_DATE_PROP') || CONFIG.DEFAULT_DATE_PROP;
}

/**
 * 昨日の日付文字列（YYYY-MM-DD）を取得
 */
function getYesterdayDateString() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return Utilities.formatDate(yesterday, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/**
 * iPhoneショートカットからのPOSTリクエスト受付口
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return makeJsonResponse({ status: 'error', message: 'No payload provided' }, 400);
    }

    const payload = JSON.parse(e.postData.contents);

    // 1. セキュリティ検証：APIキーの照合
    const expectedKey = PropertiesService.getScriptProperties().getProperty('AUTH_SECRET_KEY');
    if (!expectedKey || payload.apiKey !== expectedKey) {
      console.warn('認証失敗: APIキーが不一致または未設定です。');
      return makeJsonResponse({ status: 'forbidden', message: 'Invalid or missing API key' }, 403);
    }

    // 2. 日付の取得（指定がなければ自動で「昨日」を採用）
    const targetDate = payload.date || getYesterdayDateString();

    // 3. 画像データの正規化（単一送信と一括送信の両方に対応）
    let images = [];
    if (payload.images && Array.isArray(payload.images)) {
      images = payload.images;
    } else if (payload.image || payload.base64) {
      images = [{
        filename: payload.filename || 'photo.jpg',
        base64: payload.image || payload.base64,
        mimeType: payload.mimeType || 'image/jpeg'
      }];
    }

    if (images.length === 0) {
      return makeJsonResponse({ status: 'success', message: 'No images to process', uploaded: 0 });
    }

    if (images.length > CONFIG.MAX_IMAGES) {
      return makeJsonResponse({ status: 'error', message: `Too many images. Max allowed is ${CONFIG.MAX_IMAGES}` }, 400);
    }

    // 4. Notionの日記ページIDを検索（Dateプロパティで特定）
    const pageId = findDiaryPageForPhotos(targetDate);
    if (!pageId) {
      console.warn(`対象日 (${targetDate}) の日記ページがNotionに見つかりませんでした。`);
      return makeJsonResponse({ 
        status: 'skipped', 
        message: `Diary page for ${targetDate} not found in Notion database` 
      }, 404);
    }

    // 5. 画像を1枚ずつNotionへアップロードし、ページ本文末尾へ追加
    let successCount = 0;
    const errors = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        const rawBase64 = img.base64 || img.image;
        if (!rawBase64) {
          throw new Error('Base64 data is empty');
        }
        const decodedBytes = Utilities.base64Decode(rawBase64);
        let fileName = img.filename || `photo_${i + 1}.jpg`;
        if (!fileName.includes('.')) fileName += '.jpg';
        const mimeType = img.mimeType || (fileName.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

        // Notion File Upload API
        const fileUploadId = uploadImageBlobToNotion(blob);

        // 日記ページの本文末尾に画像ブロックを追加
        appendPhotoBlockToPage(pageId, fileUploadId);

        successCount++;
        Utilities.sleep(300); // Notion API レートリミット保護
      } catch (err) {
        console.error(`画像 [${img.filename}] の処理失敗: ${err.message}`);
        errors.push({ filename: img.filename, error: err.message });
      }
    }

    return makeJsonResponse({
      status: 'success',
      targetDate: targetDate,
      totalReceived: images.length,
      uploaded: successCount,
      errors: errors
    });

  } catch (error) {
    console.error(`Webhook全体エラー: ${error.message}`);
    return makeJsonResponse({ status: 'error', message: error.message }, 500);
  }
}

/**
 * 対象日付の日記ページを特定（Notion 2026年仕様 data_sources と旧 databases の両方に対応）
 */
function findDiaryPageForPhotos(dateStr) {
  const token = getNotionToken();
  const dateProp = getDatePropName();
  const dbId = getDatabaseId().replace(/-/g, '');
  
  const payload = {
    filter: {
      property: dateProp,
      date: { equals: dateStr }
    }
  };

  // 1. data_sources/{id}/query 形式（Notion 2026-03-11 / 2025-09-03仕様）
  const dsUrl = `https://api.notion.com/v1/data_sources/${CONFIG.DEFAULT_DATA_SOURCE_ID}/query`;
  let response = UrlFetchApp.fetch(dsUrl, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  // 2. もし失敗した場合は databases/{id}/query（2022-06-28仕様）でフォールバック試行
  if (response.getResponseCode() !== 200) {
    const legacyUrl = `https://api.notion.com/v1/databases/${dbId}/query`;
    response = UrlFetchApp.fetch(legacyUrl, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  }

  if (response.getResponseCode() !== 200) {
    throw new Error(`Notion DBクエリ失敗 (${response.getResponseCode()}): ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText());
  if (data.results && data.results.length > 0) {
    return data.results[0].id;
  }
  return null;
}

/**
 * Notion File Upload API (Direct Upload)
 */
function uploadImageBlobToNotion(blob) {
  const token = getNotionToken();

  // Step 1: File Upload オブジェクト作成
  const createUrl = 'https://api.notion.com/v1/file_uploads';
  const createRes = UrlFetchApp.fetch(createUrl, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': CONFIG.NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      filename: blob.getName(),
      content_type: blob.getContentType()
    }),
    muteHttpExceptions: true
  });

  if (createRes.getResponseCode() !== 200) {
    throw new Error(`Notion File Upload作成失敗 (${createRes.getResponseCode()}): ${createRes.getContentText()}`);
  }

  const uploadObj = JSON.parse(createRes.getContentText());
  const fileUploadId = uploadObj.id;
  const sendUrl = uploadObj.upload_url || `https://api.notion.com/v1/file_uploads/${fileUploadId}/send`;

  // Step 2: バイナリを送信 (multipart/form-data)
  const sendRes = UrlFetchApp.fetch(sendUrl, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': CONFIG.NOTION_VERSION
    },
    payload: {
      file: blob
    },
    muteHttpExceptions: true
  });

  if (sendRes.getResponseCode() !== 200) {
    throw new Error(`Notion バイナリ送信失敗 (${sendRes.getResponseCode()}): ${sendRes.getContentText()}`);
  }

  return fileUploadId;
}

/**
 * 日記ページの本文末尾に画像ブロックを追加
 */
function appendPhotoBlockToPage(pageId, fileUploadId) {
  const token = getNotionToken();
  const cleanId = pageId.replace(/-/g, '');
  const url = `https://api.notion.com/v1/blocks/${cleanId}/children`;

  const payload = {
    children: [
      {
        object: 'block',
        type: 'image',
        image: {
          type: 'file_upload',
          file_upload: {
            id: fileUploadId
          }
        }
      }
    ]
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': CONFIG.NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error(`Notion画像ブロック追加失敗 (${res.getResponseCode()}): ${res.getContentText()}`);
  }
}

/**
 * JSONレスポンス生成ヘルパー
 */
function makeJsonResponse(data, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
