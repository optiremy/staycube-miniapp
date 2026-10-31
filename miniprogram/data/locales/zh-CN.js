// 小程序中文文案：直接搜索屏幕上的文字，只修改引号内的内容。
// 左侧字段名供页面使用，请勿修改；入住须知正文由服务端提供。
module.exports = {
  "label": "中文",
  "text": {
    "eyebrow": "SELF CHECK-IN",
    "languageTitle": "请选择登记语言",
    "languageTitleEnglish": "PLEASE SELECT A REGISTRATION LANGUAGE",
    "accessCodeTitle": "请输入前台提供的 6 位自助入住码\n进入登记流程",
    "accessCodeLabel": "自助入住码",
    "accessCodePlaceholder": "请输入 6 位数字自助入住码",
    "accessCodeChecking": "正在校验...",
    "enterFlowLabel": "进入登记流程",
    "accessCodeInvalidError": "请输入 6 位数字自助入住码。",
    "accessCodeUnavailableError": "自助入住码不存在或已失效。",
    "loadingContext": "正在读取自助入住登记...",
    "unavailableTitle": "登记入口不可用",
    "unavailableMessage": "当前自助入住登记暂时无法打开。请联系前台确认。",
    "backToCode": "返回输入自助入住码",
    "submittedTitle": "您已提交自助入住登记",
    "submittedMessage": "前台将在确认信息后，通过微信将开门密码、房间/床位、拖鞋编号等信息发送给您。",
    "submittedNotice": "请留意微信消息。如有疑问，请在入住当日 22:30 前联系我们。",
    "nameCorrectionHint": "姓名如有误，请联系前台更正。",
    "title": "肆方空间 自助入住登记",
    "stepsAriaLabel": "自助入住登记步骤",
    "stepTitles": [
      "基础信息登记",
      "入住须知阅读",
      "签名确认",
      "公安登记",
      "押金缴纳"
    ],
    "basicSectionTitle": "1. 基础信息登记",
    "guestNameLabel": "旅客真实姓名",
    "contactLabel": "联系方式",
    "guestNoteLabel": "旅客备注",
    "rulesSectionTitle": "2. 入住须知阅读",
    "previousRuleLabel": "上一条",
    "nextRuleLabel": "下一条",
    "confirmedRuleLabel": "已确认",
    "basicInfoError": "请完整填写基础信息。",
    "contactPhoneError": "请输入有效的11位手机号。",
    "rulesIncompleteError": "请逐条阅读并确认完整入住须知。",
    "signatureSectionTitle": "3. 签名确认",
    "rulesFinalConfirmLabel": "我已完整阅读并确认入住须知",
    "signatureLabel": "手写签名",
    "clearSignatureLabel": "清除重写",
    "signatureHint": "请先勾选上方确认项，确认完成后再进行手写签名。",
    "signatureError": "请先确认已完整阅读入住须知，再完成手写签名。",
    "policeSectionTitle": "4. 公安登记验证码回填",
    "policeDescription": "请使用支付宝完成公安登记；登记后页面会生成 6 位验证码，请填写在下方供前台核验。",
    "policeQrTitle": "公安登记二维码",
    "policeQrInstruction": "请保存图片，使用支付宝扫一扫从相册中选择并识别二维码，完成公安登记。",
    "policeCodeLabel": "公安登记 6 位验证码",
    "policeCompleteLabel": "我确认已完成公安登记",
    "policeCodeError": "公安登记验证码必须为 6 位数字。",
    "policeCompleteError": "请确认已完成公安登记。",
    "depositSectionTitle": "5. 押金缴纳记录",
    "depositDescription": "请扫二维码缴纳入住押金 100 元/人；押金将在前台当日确认自助入住信息无误后原路退还。",
    "depositQrTitle": "押金收款二维码",
    "depositQrInstruction": "请保存图片，使用支付宝扫一扫或其他支付工具从相册中选择并识别二维码完成支付。",
    "depositConfirmLabel": "我确认已按说明缴纳押金",
    "depositConfirmError": "请确认已按说明缴纳押金。",
    "backLabel": "返回",
    "previousStepLabel": "上一步",
    "nextStepLabel": "下一步",
    "submitLabel": "提交自助入住登记",
    "submittingLabel": "正在提交...",
    "loadingError": "读取自助入住登记失败。",
    "submitError": "提交失败，请检查后重试。",
    "testCompletedTitle": "测试流程已完成",
    "testCompletedMessage": "此测试仅用于页面与流程确认；未提交入住登记记录、未上传资料，也未触发门锁。"
  },
  "foreignDocuments": {
    "stepTitle": "证件照片",
    "sectionTitle": "4. 证件照片",
    "description": "请拍摄并上传以下两张证件照片，前台审核后将为您完成住宿登记。",
    "passportLabel": "护照个人信息页",
    "visaOrEntryLabel": "签证页 / 入境记录",
    "photoHint": "请拍摄清晰照片或从相册选择，姓名、证件号码和日期需清楚可见。",
    "replaceLabel": "拍摄 / 更换照片",
    "missingError": "请上传两张证件照片。",
    "compressionError": "照片无法压缩，请重新拍摄清晰照片后重试。",
    "depositInstruction": "请截图保存，然后在支付宝或微信中从相册选择二维码付款"
  },
  "depositProof": {
    "title": "上传支付成功截图",
    "empty": "尚未上传付款截图",
    "upload": "选择付款截图",
    "replace": "更换截图",
    "selected": "已选择付款截图",
    "previewAlt": "付款成功截图预览",
    "missingError": "请先上传支付成功截图，再提交登记。",
    "compressionError": "截图无法处理，请选择清晰的付款成功截图重试。"
  },
  "lookupErrors": {
    "network": {
      "title": "当前网络连接不畅",
      "message": "暂时无法连接登记服务。请检查网络或切换 Wi-Fi、移动数据后重试。",
      "retryLabel": "重新连接"
    },
    "timeout": {
      "title": "网络响应较慢",
      "message": "连接登记服务超时，请稍后重试。",
      "retryLabel": "重新连接"
    },
    "service": {
      "title": "登记服务暂时繁忙",
      "message": "登记服务暂时无法响应，请稍后重试；持续失败请联系前台。",
      "retryLabel": "重新连接"
    },
    "rules": {
      "title": "入住须知暂时无法加载",
      "message": "入住须知数据暂时无法读取，请重试或联系前台。",
      "retryLabel": "重新加载"
    },
    "expired": {
      "title": "该入住码已失效",
      "message": "该入住码已失效，请联系前台。",
      "retryLabel": "返回"
    },
    "code": {
      "title": "自助入住码无效",
      "message": "未找到可用的自助入住码，请核对后重新输入；如确认无误，请联系前台。",
      "retryLabel": "再次验证"
    }
  }
}
