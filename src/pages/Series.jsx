import { useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'
import { getSeries } from '../data/comics.js'
import { getProfileProgress, setComicBookmark } from '../utils/progress.js'
import { assetPath } from '../utils/assetPath.js'
import { sitePath } from '../utils/sitePath.js'

function Series({ user }) {
  const { params } = useRoute()
  const series = getSeries(params.seriesId)
  const [progress, setProgress] = useState(() => getProfileProgress(user.username))

  function toggleBookmark(comicId) {
    const item = progress[comicId]
    const isBookmarked = item?.bookmarked ?? (item?.status === 'saved' || item?.status === 'queue')
    setProgress(setComicBookmark(user.username, comicId, !isBookmarked))
  }

  if (!series) {
    return (
      <section class="page viewer-message">
        <h1>Series not found</h1>
        <a href={sitePath('/')}>Back to the library</a>
      </section>
    )
  }

  return (
    <section class="page series-page">
      <div class="series-heading">
        <a href={sitePath('/')}>← All series</a>
        <h1>{series.name}</h1>
        <p>{series.comics.length} {series.comics.length === 1 ? 'issue' : 'issues'}</p>
      </div>

      <div class="comic-grid">
        {series.comics.map((comic) => {
          const item = progress[comic.id]
          const isBookmarked = item?.bookmarked ?? (item?.status === 'saved' || item?.status === 'queue')

          return (
            <article class="comic-card" key={comic.id}>
              <a class="comic-open" href={sitePath(`/comic/${comic.id}`)}>
                {comic.cover ? (
                  <img class="comic-cover-image" src={assetPath(comic.cover)} alt={`${comic.title} ${comic.issue} cover`} />
                ) : (
                  <div class="comic-cover" aria-hidden="true">{comic.issue || 'READ'}</div>
                )}
              </a>
              <h2>{comic.issue ? `Issue ${comic.issue}` : comic.title}</h2>
              <div class="progress-options" aria-label={`Reading progress for ${comic.title} ${comic.issue}`}>
                <button
                  class={isBookmarked ? 'progress-button active' : 'progress-button'}
                  type="button"
                  aria-pressed={isBookmarked}
                  onClick={() => toggleBookmark(comic.id)}
                >
                  {isBookmarked ? 'Bookmarked' : 'Bookmark'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default Series
