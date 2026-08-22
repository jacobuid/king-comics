import { ErrorBoundary, LocationProvider, Route, Router } from 'preact-iso'
import Header from './components/Header.jsx'
import ProfileMigration from './components/ProfileMigration.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import Home from './pages/Home.jsx'
import ComicViewer from './pages/ComicViewer.jsx'
import NotFound from './pages/NotFound.jsx'
import Profile from './pages/Profile.jsx'
import ProfilePicker from './pages/ProfilePicker.jsx'
import Series from './pages/Series.jsx'
import { routerPath } from './utils/sitePath.js'

function App() {
  return (
    <LocationProvider scope={import.meta.env.BASE_URL}>
      <ProfileMigration />
      <Header />
      <main>
        <ErrorBoundary>
          <Router>
            <Route path={routerPath('/')} component={RequireAuth} page={Home} />
            <Route path={routerPath('/profiles')} component={ProfilePicker} />
            <Route path={routerPath('/profile')} component={RequireAuth} page={Profile} />
            <Route path={routerPath('/comic/:comicId')} component={RequireAuth} page={ComicViewer} />
            <Route path={routerPath('/:seriesId')} component={RequireAuth} page={Series} />
            <Route default component={NotFound} />
          </Router>
        </ErrorBoundary>
      </main>
    </LocationProvider>
  )
}

export default App
