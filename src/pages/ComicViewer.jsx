import { Archive } from 'libarchive.js'
import { unzipSync } from 'fflate'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import { getComic, getSeries } from '../data/comics.js'
import { getProfileProgress, setComicProgress } from '../utils/progress.js'
import { assetPath } from '../utils/assetPath.js'
import { sitePath } from '../utils/sitePath.js'

const imagePattern = /\.(avif|bmp|gif|jpe?g|png|webp)$/i

function imageMimeType(path) {
  const extension = path.split('.').pop()?.toLowerCase()

  return {
    avif: 'image/avif',
    bmp: 'image/bmp',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }[extension] ?? 'application/octet-stream'
}

async function archiveFormat(blob) {
  const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  const isZip = signature[0] === 0x50 && signature[1] === 0x4b
  const isRar = signature[0] === 0x52
    && signature[1] === 0x61
    && signature[2] === 0x72
    && signature[3] === 0x21

  if (isZip) return 'zip'
  if (isRar) return 'rar'
  return 'archive'
}

async function extractZipImages(blob) {
  const archiveData = new Uint8Array(await blob.arrayBuffer())
  const files = unzipSync(archiveData)

  return Object.entries(files)
    .filter(([name]) => imagePattern.test(name))
    .map(([path, data]) => ({
      file: new Blob([data], { type: imageMimeType(path) }),
      path,
    }))
}

function flattenImages(value, parentPath = '') {
  const images = []

  for (const [name, child] of Object.entries(value)) {
    const imagePath = parentPath ? `${parentPath}/${name}` : name
    if (child instanceof File && imagePattern.test(name)) images.push({ file: child, path: imagePath })
    else if (child && typeof child === 'object' && !(child instanceof File)) {
      images.push(...flattenImages(child, imagePath))
    }
  }

  return images
}

function ComicViewer({ user }) {
  const { params } = useRoute()
  const { route } = useLocation()
  const comic = getComic(params.comicId)
  const series = comic ? getSeries(comic.seriesId) : null
  const viewerRef = useRef(null)
  const continuousViewRef = useRef(null)
  const continuousPageRefs = useRef([])
  const [pages, setPages] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [loadedComicId, setLoadedComicId] = useState(null)
  const [loading, setLoading] = useState(Boolean(comic))
  const [error, setError] = useState('')
  const [fit, setFit] = useState('width')
  const [readerMode, setReaderMode] = useState('single')

  useEffect(() => {
    if (!comic) return

    let active = true
    let pageUrls = []
    setLoading(true)
    setError('')
    setPages([])
    setPageIndex(0)
    setLoadedComicId(null)
    continuousPageRefs.current = []

    async function loadComic() {
      try {
        Archive.init({ workerUrl: sitePath('/libarchive/worker-bundle.js') })
        const response = await fetch(assetPath(comic.archive))
        if (!response.ok) throw new Error(`Could not load this comic (${response.status}).`)

        const archiveBlob = await response.blob()
        const format = await archiveFormat(archiveBlob)
        let images

        if (format === 'zip') {
          images = await extractZipImages(archiveBlob)
        } else {
          const archiveFile = new File([archiveBlob], `${comic.id}.${format}`)
          const archive = await Archive.open(archiveFile)
          images = flattenImages(await archive.extractFiles())
        }

        images = images
          .sort((first, second) => first.path.localeCompare(second.path, undefined, {
            numeric: true,
            sensitivity: 'base',
          }))

        if (images.length === 0) throw new Error('This archive does not contain any supported images.')

        pageUrls = images.map(({ file, path }) => ({ path, url: URL.createObjectURL(file) }))
        if (!active) return

        const storedPage = Number(getProfileProgress(user.username)[comic.id]?.page)
        const savedPage = Number.isInteger(storedPage) && storedPage > 0 ? storedPage : 1
        setPages(pageUrls)
        setPageIndex(Math.min(Math.max(savedPage - 1, 0), pageUrls.length - 1))
        setLoadedComicId(comic.id)
      } catch (loadError) {
        if (active) setError(loadError.message || 'This comic could not be opened.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadComic()

    return () => {
      active = false
      pageUrls.forEach(({ url }) => URL.revokeObjectURL(url))
    }
  }, [comic?.id, user.username])

  useEffect(() => {
    if (!comic || loadedComicId !== comic.id || pages.length === 0) return
    setComicProgress(user.username, comic.id, 'read', {
      page: pageIndex + 1,
      pageCount: pages.length,
    })
  }, [comic?.id, loadedComicId, pageIndex, pages.length, user.username])

  useEffect(() => {
    function handleKeydown(event) {
      if (readerMode !== 'single') return
      if (event.key === 'ArrowLeft') setPageIndex((index) => Math.max(0, index - 1))
      if (event.key === 'ArrowRight') setPageIndex((index) => Math.min(pages.length - 1, index + 1))
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [pages.length, readerMode])

  useEffect(() => {
    if (readerMode !== 'continuous' || pages.length === 0 || !continuousViewRef.current) return

    const observer = new IntersectionObserver((entries) => {
      const visiblePage = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0]

      if (visiblePage) setPageIndex(Number(visiblePage.target.dataset.pageIndex))
    }, {
      root: continuousViewRef.current,
      threshold: [0.25, 0.5, 0.75],
    })

    continuousPageRefs.current.forEach((page) => page && observer.observe(page))
    continuousPageRefs.current[pageIndex]?.scrollIntoView({ block: 'start' })

    return () => observer.disconnect()
  }, [loadedComicId, pages.length, readerMode])

  if (!comic) {
    return <section class="page viewer-message"><h1>Comic not found</h1><a href={sitePath('/')}>Back to the library</a></section>
  }

  return (
    <section class="comic-viewer" ref={viewerRef}>
      <div class="viewer-toolbar">
        <a href={sitePath(`/${comic.seriesId}`)} aria-label={`Back to ${comic.series}`}>← Series</a>
        <div class="viewer-comic-nav">
          <strong>{comic.series}</strong>
          <select
            aria-label="Choose another comic in this series"
            value={comic.id}
            onChange={(event) => route(sitePath(`/comic/${event.currentTarget.value}`))}
          >
            {series?.comics.map((seriesComic) => (
              <option value={seriesComic.id} key={seriesComic.id}>
                {seriesComic.issue ? `Issue ${seriesComic.issue}` : seriesComic.title}
              </option>
            ))}
          </select>
        </div>
        <div class="viewer-tools">
          <button type="button" onClick={() => setFit((value) => value === 'width' ? 'page' : 'width')}>
            Fit {fit === 'width' ? 'page' : 'width'}
          </button>
          <button
            type="button"
            aria-pressed={readerMode === 'continuous'}
            onClick={() => setReaderMode((mode) => mode === 'single' ? 'continuous' : 'single')}
          >
            {readerMode === 'single' ? 'All pages' : 'Single page'}
          </button>
          <button type="button" onClick={() => viewerRef.current?.requestFullscreen?.()}>Fullscreen</button>
        </div>
      </div>

      {loading && <p class="viewer-status" role="status">Opening comic…</p>}
      {error && <p class="viewer-status error" role="alert">{error}</p>}
      {pages.length > 0 && readerMode === 'single' && (
        <div class="viewer-stage">
          <button
            class="page-arrow previous-page"
            type="button"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
            aria-label="Previous page"
          >‹</button>
          <img class={`comic-page fit-${fit}`} src={pages[pageIndex].url} alt={`Page ${pageIndex + 1}`} />
          <button
            class="page-arrow next-page"
            type="button"
            disabled={pageIndex === pages.length - 1}
            onClick={() => setPageIndex((index) => Math.min(pages.length - 1, index + 1))}
            aria-label="Next page"
          >›</button>
        </div>
      )}

      {pages.length > 0 && readerMode === 'continuous' && (
        <div class="viewer-stage continuous-view" ref={continuousViewRef}>
          {pages.map((page, index) => (
            <img
              class="comic-page fit-width"
              src={page.url}
              alt={`Page ${index + 1}`}
              data-page-index={index}
              key={page.path}
              ref={(element) => { continuousPageRefs.current[index] = element }}
            />
          ))}
        </div>
      )}

      {pages.length > 0 && <p class="page-counter">Page {pageIndex + 1} of {pages.length}</p>}
    </section>
  )
}

export default ComicViewer
