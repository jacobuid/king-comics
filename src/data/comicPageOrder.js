const looneyTunesLastPageCovers = new Set([
  '22', '26', '30', '31', '32', '33', '38', '40', '43', '46', '47', '48',
  '50', '52', '53', '54', '56', '57', '58', '60', '131', '133', '134',
  '136', '138', '140', '141', '142', '143', '144', '145',
])

export function comicPageOrderOverride(seriesId, issueNumber) {
  if (seriesId !== 'looney-tunes-1994') return null
  if (issueNumber === '203') return { coverFromEnd: 2 }
  if (looneyTunesLastPageCovers.has(issueNumber)) return { coverFromEnd: 1 }
  return null
}

export function applyComicPageOrder(pages, pageOrder) {
  const coverFromEnd = Number(pageOrder?.coverFromEnd)
  if (!Number.isInteger(coverFromEnd) || coverFromEnd < 1 || coverFromEnd >= pages.length) {
    return pages
  }

  const coverIndex = pages.length - coverFromEnd
  const originalFirstPage = pages[0]

  return [
    pages[coverIndex],
    ...pages.slice(1, coverIndex),
    ...pages.slice(coverIndex + 1),
    originalFirstPage,
  ]
}
