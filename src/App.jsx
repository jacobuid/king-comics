import { ErrorBoundary, LocationProvider, Route, Router } from 'preact-iso'
import Header from './components/Header.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import Home from './pages/Home.jsx'
import ComicViewer from './pages/ComicViewer.jsx'
import NotFound from './pages/NotFound.jsx'
import Profile from './pages/Profile.jsx'
import ProfilePicker from './pages/ProfilePicker.jsx'
import SignUp from './pages/SignUp.jsx'
import Series from './pages/Series.jsx'
import { sitePath } from './utils/sitePath.js'

function App() {
  return (
    <LocationProvider scope={import.meta.env.BASE_URL}>
      <Header />
      <main>
        <ErrorBoundary>
          <Router>
            <Route path={sitePath('/')} component={RequireAuth} page={Home} />
            <Route path={sitePath('/signup')} component={SignUp} />
            <Route path={sitePath('/profiles')} component={ProfilePicker} />
            <Route path={sitePath('/profile')} component={RequireAuth} page={Profile} />
            <Route path={sitePath('/comic/:comicId')} component={RequireAuth} page={ComicViewer} />
            <Route path={sitePath('/:seriesId')} component={RequireAuth} page={Series} />
            <Route default component={NotFound} />
          </Router>
        </ErrorBoundary>
      </main>
    </LocationProvider>
  )
}

export default App
