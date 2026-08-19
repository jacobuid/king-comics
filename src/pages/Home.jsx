import { useEffect, useMemo, useState } from 'preact/hooks'
import { seriesList } from '../data/comics.js'
import { assetPath } from '../utils/assetPath.js'
import { sitePath } from '../utils/sitePath.js'

function Home() {
  const [seriesQuery, setSeriesQuery] = useState('')
  const visibleSeries = useMemo(() => {
    const query = seriesQuery.trim().toLocaleLowerCase()
    if (!query) return seriesList

    return seriesList.filter((series) => series.name.toLocaleLowerCase().includes(query))
  }, [seriesQuery])

  useEffect(() => {
    const targetId = window.location.hash.slice(1)
    if (!targetId.startsWith('series-')) return

    let secondFrame = null
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ block: 'center' })
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    }
  }, [])

  return (
    <section class="page library-page">
      {seriesList.length === 0 && (
        <div class="empty-library">
          <h2>Your shelves are ready</h2>
          <p>Add <code>.cbz</code> or <code>.cbr</code> files to <code>public/comics/Series Name/</code>, then restart the development server.</p>
        </div>
      )}

      {seriesList.length > 0 && (
        <div class="series-browser-tools library-search-tools">
          <label for="library-search">Search library</label>
          <input
            id="library-search"
            type="search"
            value={seriesQuery}
            onInput={(event) => setSeriesQuery(event.currentTarget.value)}
            placeholder="Search series"
            autoComplete="off"
          />
          {seriesQuery && (
            <span class="series-search-count" role="status">
              {visibleSeries.length} series found
            </span>
          )}
        </div>
      )}

      <div class="series-grid">
        {visibleSeries.map((series) => (
          <a
            class="series-card"
            href={sitePath(`/${series.id}`)}
            id={`series-${series.id}`}
            key={series.id}
          >
            {series.cover ? (
              <img
                class="comic-cover-image"
                src={assetPath(series.cover)}
                alt={`${series.name} cover`}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div class="comic-cover" aria-hidden="true">READ</div>
            )}
            <div class="series-card-copy">
              <h2>{series.name}</h2>
              <p>{series.comics.length} {series.comics.length === 1 ? 'issue' : 'issues'}</p>
            </div>
          </a>
        ))}
      </div>
      {seriesList.length > 0 && visibleSeries.length === 0 && (
        <p class="empty-list series-search-empty">No series match “{seriesQuery}”.</p>
      )}
    </section>
  )
}

export default Home
