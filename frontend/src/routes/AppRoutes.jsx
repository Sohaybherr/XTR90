import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import AdminRoute from './AdminRoute'
import ProtectedRoute from './ProtectedRoute'
import LanguageRoute from './LanguageRoute'
import RootRedirect from './RootRedirect'

const Home = lazy(() => import('../pages/Home/Home'))
const Team = lazy(() => import('../pages/Team/Team'))
const TeamCompetition = lazy(() => import('../pages/TeamCompetition/TeamCompetition'))
const Player = lazy(() => import('../pages/Player/Player'))
const Competition = lazy(() => import('../pages/Competition/Competition'))
const Match = lazy(() => import('../pages/Match/Match'))
const News = lazy(() => import('../pages/News/News'))
const NewsDetails = lazy(() => import('../pages/News/NewsDetails'))
const Search = lazy(() => import('../pages/Search/Search'))
const Statistics = lazy(() => import('../pages/Statistics/Statistics'))
const Transfers = lazy(() => import('../pages/Transfers/Transfers'))
const Rankings = lazy(() => import('../pages/Rankings/Rankings'))
const Menu = lazy(() => import('../pages/Menu/Menu'))
const Learn = lazy(() => import('../pages/Learn/Learn'))
const Plans = lazy(() => import('../pages/Professional/Plans'))
const Payment = lazy(() => import('../pages/Professional/Payment'))
const Conditions = lazy(() => import('../pages/Professional/Conditions'))
const Contact = lazy(() => import('../pages/Professional/Contact'))
const Profile = lazy(() => import('../pages/Profile/Profile'))
const Favorites = lazy(() => import('../pages/Favorites/Favorites'))
const Login = lazy(() => import('../pages/Auth/Login'))
const Register = lazy(() => import('../pages/Auth/Register'))
const AdminDashboard = lazy(() => import('../pages/Admin/AdminDashboard'))
const AdminNewsNew = lazy(() => import('../pages/Admin/AdminNewsNew'))
const AdminUsers = lazy(() => import('../pages/Admin/AdminUsers'))
const NotFound = lazy(() => import('../pages/NotFound/NotFound'))

function RouteFallback() {
  return <div className="state-message">Loading...</div>
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route index element={<RootRedirect />} />
        <Route path=":lang" element={<LanguageRoute />}>
          <Route element={<MainLayout />}>
            <Route index element={<Home />} />
            <Route path="matches" element={<Home />} />
            <Route path="teams/:teamId/competitions/:competitionSeasonId" element={<TeamCompetition />} />
            <Route path="teams/:id" element={<Team />} />
            <Route path="players/:id" element={<Player />} />
            <Route path="competitions/:id" element={<Competition />} />
            <Route path="matches/:id" element={<Match />} />
            <Route path="news" element={<News />} />
            <Route path="news/:id" element={<NewsDetails />} />
            <Route path="search" element={<Search />} />
            <Route path="statistics" element={<Statistics />} />
            <Route path="transfers" element={<Transfers />} />
            <Route path="rankings" element={<Rankings />} />
            <Route path="menu" element={<Menu />} />
            <Route path="learn" element={<Learn />} />
            <Route path="plans" element={<Plans />} />
            <Route path="payment" element={<Payment />} />
            <Route path="conditions" element={<Conditions />} />
            <Route path="contact" element={<Contact />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route element={<ProtectedRoute />}>
              <Route path="profile" element={<Profile />} />
              <Route path="favorites" element={<Favorites />} />
            </Route>
            <Route element={<AdminRoute />}>
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="admin/news/new" element={<AdminNewsNew />} />
              <Route path="admin/users" element={<AdminUsers />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
  )
}

export default AppRoutes
