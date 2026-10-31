const testMode = require('./test-mode')
const { requestGuest, uploadGuestFile, createRequestId } = require('./guest-transport')

class LuggageStorageApiError extends Error {
  constructor(kind, message, statusCode) {
    super(message)
    this.kind = kind
    this.statusCode = statusCode || 0
  }
}

function request(path, data, timeout = 12000) {
  return requestGuest(path, data, timeout).catch(error => {
    if (error instanceof LuggageStorageApiError) throw error
    throw new LuggageStorageApiError(error.kind || 'service', error.message || '请求失败', error.statusCode || 0)
  })
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data
}

const luggageStorageApi = {
  async getPublicContext() {
    const row = firstRow(await request('/rest/v1/rpc/get_luggage_storage_public_context', {}))
    if (!row || typeof row.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.today)) {
      throw new LuggageStorageApiError('service', '行李寄存信息暂时无法读取，请稍后重试。')
    }
    return {
      today: row.today,
      maxPhotoBytes: Number(row.max_photo_bytes) > 0 ? Number(row.max_photo_bytes) : 1024 * 1024,
      allowedPhotoTypes: Array.isArray(row.allowed_photo_types) ? row.allowed_photo_types : [],
    }
  },

  async createDraft(requestId = createRequestId()) {
    if (testMode.enabled) return { id: `test-${Date.now()}`, token: 'test-only-token' }
    const row = firstRow(await request('/rest/v1/rpc/create_luggage_storage_public_draft_v2', { p_request_id: requestId }))
    if (typeof row?.id !== 'string' || !row.id || typeof row?.token !== 'string' || !row.token) {
      throw new LuggageStorageApiError('service', '无法创建行李寄存登记，请重试。')
    }
    return { id: row.id, token: row.token }
  },

  uploadPhoto(recordId, filePath, uploadId = Date.now()) {
    if (testMode.enabled) return Promise.resolve(`test-only/${recordId}/${String(filePath || '').split('/').pop() || 'photo.jpg'}`)
    const path = `luggage-storage/${recordId}/photo-${uploadId}.jpg`
    return uploadGuestFile('luggage-storage-photos', path, filePath, 'image/jpeg').then(() => path).catch(error => {
      throw new LuggageStorageApiError(error.kind || 'upload', error.message || '上传失败', error.statusCode || 0)
    })
  },

  async submit(token, payload) {
    if (testMode.enabled) return { id: 'test-luggage-storage', status: 'test_completed' }
    let row
    try { row = firstRow(await request('/rest/v1/rpc/submit_luggage_storage_record', { p_token: token, p_payload: payload }, 20000)) }
    catch (error) {
      const status = firstRow(await request('/rest/v1/rpc/get_luggage_storage_submission_status', { p_token: token }, 12000).catch(() => null))
      if (status?.status === 'submitted' && status.id) return status
      throw error
    }
    if (typeof row?.id !== 'string' || row.status !== 'submitted') {
      throw new LuggageStorageApiError('uncertain', '未能确认寄存提交结果，请联系前台核对后再操作。')
    }
    return row
  },
}

module.exports = { LuggageStorageApiError, luggageStorageApi }
