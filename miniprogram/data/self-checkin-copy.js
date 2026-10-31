// Page code keeps using this single import; edit visible copy in locales/<language>.js.
const bundles = {
  'zh-CN': require('./locales/zh-CN'),
  'en-US': require('./locales/en-US'),
  'de-DE': require('./locales/de-DE'),
  'fr-FR': require('./locales/fr-FR'),
  'es-ES': require('./locales/es-ES'),
  'it-IT': require('./locales/it-IT'),
  'ja-JP': require('./locales/ja-JP'),
  'ko-KR': require('./locales/ko-KR'),
}

const locales = {}
const foreignDocuments = {}
const depositProof = {}
const lookupErrors = {}
const supportedLanguages = []

for (const locale of Object.keys(bundles)) {
  const bundle = bundles[locale]
  locales[locale] = bundle.text
  if (bundle.foreignDocuments) foreignDocuments[locale] = bundle.foreignDocuments
  depositProof[locale] = bundle.depositProof
  lookupErrors[locale] = bundle.lookupErrors
  supportedLanguages.push({ locale, label: bundle.label })
}

module.exports = { locales, foreignDocuments, depositProof, lookupErrors, supportedLanguages }
