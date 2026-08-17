import { seriesList } from '../data/comics.js'
import { assetPath } from '../utils/assetPath.js'
import { sitePath } from '../utils/sitePath.js'

function Home() {
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
          <a class="series-card" href={sitePath(`/${series.id}`)} key={series.id}>
            {series.cover ? (
              <img class="comic-cover-image" src={assetPath(series.cover)} alt={`${series.name} cover`} />
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
