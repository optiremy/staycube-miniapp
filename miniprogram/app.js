App({
  onShow() {
    if (typeof getCurrentPages !== 'function') return
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage && currentPage.route === 'pages/home/index' && typeof currentPage.refreshDraftModal === 'function') {
      currentPage.refreshDraftModal()
    }
  },
})
