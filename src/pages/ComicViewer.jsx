import { Archive } from 'libarchive.js'
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons'
import { unzipSync } from 'fflate'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import FontAwesomeIcon from '../components/FontAwesomeIcon.jsx'
import GestureGuide from '../components/GestureGuide.jsx'
import { getComic, getSeries } from '../data/comics.js'
import { getProfileProgress, setComicProgress } from '../utils/progress.js'
import { assetPath } from '../utils/assetPath.js'
import { sitePath } from '../utils/sitePath.js'

const imagePattern = /\.(avif|bmp|gif|jpe?g|png|webp)$/i
const gestureGuideStorageKey = 'king-comics:gesture-guide-v1'

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
  const touchControlsTimerRef = useRef(null)
  const pageDragRef = useRef(null)
  const lastPageTapRef = useRef(null)
  const [pages, setPages] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [loadedComicId, setLoadedComicId] = useState(null)
  const [loading, setLoading] = useState(Boolean(comic))
  const [error, setError] = useState('')
  const [fit, setFit] = useState('width')
  const [readerMode, setReaderMode] = useState('single')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [touchControlsActive, setTouchControlsActive] = useState(false)
  const [showGestureGuide, setShowGestureGuide] = useState(false)

  function dismissGestureGuide() {
    setShowGestureGuide(false)

    try {
      localStorage.setItem(gestureGuideStorageKey, 'dismissed')
    } catch {
      // Dismissal still works for this visit when storage is unavailable.
    }
  }

  function activateTouchControls() {
    setTouchControlsActive(true)
    window.clearTimeout(touchControlsTimerRef.current)
    touchControlsTimerRef.current = window.setTimeout(() => {
      setTouchControlsActive(false)
    }, 10_000)
  }

  useEffect(() => () => window.clearTimeout(touchControlsTimerRef.current), [])

  useEffect(() => {
    if (readerMode !== 'single' || pages.length === 0) return

    try {
      if (!localStorage.getItem(gestureGuideStorageKey)) setShowGestureGuide(true)
    } catch {
      setShowGestureGuide(true)
    }
  }, [pages.length, readerMode])

  function startPageDrag(event) {
    if (event.button !== undefined && event.button !== 0) return
    if (event.target.closest('button')) return
    pageDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function finishPageDrag(event) {
    const drag = pageDragRef.current
    pageDragRef.current = null
    if (!drag || drag.pointerId !== event.pointerId) return

    const horizontalDistance = event.clientX - drag.startX
    const verticalDistance = event.clientY - drag.startY
    const isHorizontalGesture = Math.abs(horizontalDistance) >= 50
      && Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.25

    if (isHorizontalGesture) {
      lastPageTapRef.current = null

      if (horizontalDistance < 0) {
        setPageIndex((index) => Math.min(pages.length - 1, index + 1))
      } else {
        setPageIndex((index) => Math.max(0, index - 1))
      }
      return
    }

    const isTap = Math.abs(horizontalDistance) <= 10 && Math.abs(verticalDistance) <= 10
    const comicPage = viewerRef.current?.querySelector('.single-page-view .comic-page')
    if (!isTap || !comicPage) {
      lastPageTapRef.current = null
      return
    }

    const pageBounds = comicPage.getBoundingClientRect()
    const isInsidePage = event.clientX >= pageBounds.left
      && event.clientX <= pageBounds.right
      && event.clientY >= pageBounds.top
      && event.clientY <= pageBounds.bottom
    if (!isInsidePage) {
      lastPageTapRef.current = null
      return
    }

    const side = event.clientX < pageBounds.left + pageBounds.width / 2 ? 'left' : 'right'
    const now = performance.now()
    const previousTap = lastPageTapRef.current
    const isDoubleTap = previousTap
      && previousTap.side === side
      && now - previousTap.time <= 350

    if (!isDoubleTap) {
      lastPageTapRef.current = { side, time: now }
      return
    }

    event.preventDefault()
    lastPageTapRef.current = null
    if (side === 'right') {
      setPageIndex((index) => Math.min(pages.length - 1, index + 1))
    } else {
      setPageIndex((index) => Math.max(0, index - 1))
    }
  }

  function cancelPageDrag() {
    pageDragRef.current = null
    lastPageTapRef.current = null
  }

  useEffect(() => {
    function updateFullscreenState() {
      setIsFullscreen(document.fullscreenElement === viewerRef.current)
    }

    document.addEventListener('fullscreenchange', updateFullscreenState)
    updateFullscreenState()
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [])

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.()
    } else {
      await viewerRef.current?.requestFullscreen?.()
    }
  }

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
    <section
      class={touchControlsActive ? 'comic-viewer touch-controls-active' : 'comic-viewer'}
      ref={viewerRef}
    >
      <div class="viewer-toolbar">
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
          {readerMode === 'single' && (
            <button
              class="gesture-help-button"
              type="button"
              onClick={() => setShowGestureGuide(true)}
              aria-label="Show gesture controls"
              title="Gesture controls"
            >
              <FontAwesomeIcon icon={faCircleQuestion} />
            </button>
          )}
          <button
            class="viewer-fit-button"
            type="button"
            onClick={() => setFit((value) => value === 'width' ? 'page' : 'width')}
          >
            Fit {fit === 'width' ? 'page' : 'width'}
          </button>
          <button
            type="button"
            aria-pressed={readerMode === 'continuous'}
            onClick={() => setReaderMode((mode) => mode === 'single' ? 'continuous' : 'single')}
          >
            {readerMode === 'single' ? 'All pages' : 'Single page'}
          </button>
          <button
            class={isFullscreen ? 'fullscreen-toggle exit-fullscreen' : 'fullscreen-toggle'}
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '×' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {loading && <p class="viewer-status" role="status">Opening comic…</p>}
      {error && <p class="viewer-status error" role="alert">{error}</p>}
      {pages.length > 0 && readerMode === 'single' && (
        <div
          class="viewer-stage single-page-view"
          onPointerDown={startPageDrag}
          onPointerUp={finishPageDrag}
          onPointerCancel={cancelPageDrag}
        >
          <button
              class="page-arrow previous-page"
              type="button"
              disabled={pageIndex === 0}
              onPointerDown={activateTouchControls}
            onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
            aria-label="Previous page"
          >‹</button>
          <img
            class={`comic-page fit-${fit}`}
            src={pages[pageIndex].url}
            alt={`Page ${pageIndex + 1}`}
            draggable={false}
          />
          <button
              class="page-arrow next-page"
              type="button"
              disabled={pageIndex === pages.length - 1}
              onPointerDown={activateTouchControls}
            onClick={() => setPageIndex((index) => Math.min(pages.length - 1, index + 1))}
            aria-label="Next page"
          >›</button>
        </div>
      )}

      {pages.length > 0 && readerMode === 'single' && showGestureGuide && (
        <GestureGuide onDismiss={dismissGestureGuide} />
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
