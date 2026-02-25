import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CallbackView from '../views/CallbackView.vue'
import AdminVolunteersView from '../views/AdminVolunteersView.vue'
import AdminMatrixView from '../views/AdminMatrixView.vue'
import LeaderView from '../views/LeaderView.vue'
import LeaderVolunteerView from '../views/LeaderVolunteerView.vue'
import ServeView from '../views/ServeView.vue'
import LifeGroupsMapView from '../views/LifeGroupsMapView.vue'
import FindYourFitView from '../views/FindYourFitView.vue'
import ResourcesView from '../views/ResourcesView.vue'
import EventCheckinsView from '../views/EventCheckinsView.vue'
import FundraiserView from '../views/FundraiserView.vue'
import UncommonScoreboardView from '../views/uncommon/UncommonScoreboardView.vue'
import UncommonBalanceView from '../views/uncommon/UncommonBalanceView.vue'
import UncommonPointsView from '../views/uncommon/UncommonPointsView.vue'
import UncommonDrawingView from '../views/uncommon/UncommonDrawingView.vue'
import UncommonLeadersView from '../views/uncommon/UncommonLeadersView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/auth/callback',
      name: 'callback',
      component: CallbackView,
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminVolunteersView,
    },
    {
      path: '/admin/matrix',
      name: 'admin-matrix',
      component: AdminMatrixView,
    },
    {
      path: '/leader',
      name: 'leader',
      component: LeaderView,
    },
    {
      path: '/leader/volunteer/:id',
      name: 'leader-volunteer',
      component: LeaderVolunteerView,
    },
    {
      path: '/serve',
      name: 'serve',
      component: ServeView,
      meta: { public: true },
    },
    {
      path: '/lifegroups',
      name: 'lifegroups',
      component: LifeGroupsMapView,
      meta: { public: true },
    },
    {
      path: '/find-your-fit',
      name: 'find-your-fit',
      component: FindYourFitView,
      meta: { public: true },
    },
    {
      path: '/resources',
      name: 'resources',
      component: ResourcesView,
    },
    {
      path: '/event/checkins/:eventId/:eventPeriodId',
      name: 'event-checkins',
      component: EventCheckinsView,
      meta: { public: true },
    },
    {
      path: '/fundraiser',
      name: 'fundraiser',
      component: FundraiserView,
      meta: { public: true },
    },
    // Uncommon Men's Conference
    {
      path: '/uncommon/scoreboard',
      name: 'uncommon-scoreboard',
      component: UncommonScoreboardView,
      meta: { public: true },
    },
    {
      path: '/uncommon/balance',
      name: 'uncommon-balance',
      component: UncommonBalanceView,
      meta: { public: true },
    },
    {
      path: '/uncommon/points',
      name: 'uncommon-points',
      component: UncommonPointsView,
      meta: { public: true },
    },
    {
      path: '/uncommon/drawing',
      name: 'uncommon-drawing',
      component: UncommonDrawingView,
      meta: { public: true },
    },
    {
      path: '/uncommon/leaders',
      name: 'uncommon-leaders',
      component: UncommonLeadersView,
      meta: { public: true },
    },
  ],
})

export default router
