import { sitePath } from '../utils/sitePath.js'

function NotFound() {
  return (
    <section class="page">
      <p class="eyebrow">Lost between panels</p>
      <h1>Page not found</h1>
      <a class="button" href={sitePath('/')}>Return home</a>
    </section>
  )
}

export default NotFound
