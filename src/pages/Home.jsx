import { useEffect } from 'preact/hooks'
import { seriesList } from '../data/comics.js'
import { assetPath } from '../utils/assetPath.js'
import { sitePath } from '../utils/sitePath.js'

function Home() {
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
    <section class="page">
      {seriesList.length === 0 && (
        <div class="empty-library">
          <h2>Your shelves are ready</h2>
          <p>Add <code>.cbz</code> or <code>.cbr</code> files to <code>public/comics/Series Name/</code>, then restart the development server.</p>
        </div>
      )}

      <div class="series-grid">
        {seriesList.map((series) => (
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
    </section>
  )
}

export default Home
