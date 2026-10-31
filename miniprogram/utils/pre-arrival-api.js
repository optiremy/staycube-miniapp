const testMode = require('./test-mode')
const { validatePreArrival, contactValueFor } = require('./pre-arrival-flow')
const { requestGuest, createRequestId } = require('./guest-transport')

class PreArrivalApiError extends Error {
  constructor(kind, message, statusCode) {
    super(message)
    this.kind = kind
    this.statusCode = statusCode || 0
  }
}

const preArrivalApi = {
  submit(input) {
    const validationError = validatePreArrival(input)
    if (validationError) return Promise.reject(new PreArrivalApiError('validation', validationError))
    if (testMode.enabled) return Promise.resolve({ id: 'test-pre-arrival', status: 'test_completed' })
    const requestId = input.requestId || createRequestId()
    return requestGuest('/rest/v1/rpc/submit_pre_arrival_v2', {
      p_request_id: requestId,
      p_locale: input.locale,
      p_guest_name: input.guestName.trim(),
      p_contact_method: input.contactMethod,
      p_contact_value: contactValueFor(input),
      p_arrival_time: input.arrivalTime,
      p_bed_preference: input.bedPreference,
      p_guest_note: input.guestNote.trim() || null,
    }, 20000).then(response => {
      const row = Array.isArray(response) ? response[0] : response
      if (!row || typeof row.id !== 'string' || row.status !== 'submitted') throw new PreArrivalApiError('uncertain', '提交结果暂时无法确认，请稍后联系前台核对。')
      return row
    }).catch(error => {
      if (error instanceof PreArrivalApiError) throw error
      throw new PreArrivalApiError(error.kind || 'uncertain', error.message || '提交状态暂时无法确认，请稍后联系前台核对。', error.statusCode || 0)
    })
  },
}

module.exports = { PreArrivalApiError, preArrivalApi }
