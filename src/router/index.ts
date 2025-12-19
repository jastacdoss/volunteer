import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CallbackView from '../views/CallbackView.vue'
import AdminVolunteersView from '../views/AdminVolunteersView.vue'
import AdminMatrixView from '../views/AdminMatrixView.vue'
import LeaderView from '../views/LeaderView.vue'
import LeaderVolunteerView from '../views/LeaderVolunteerView.vue'
import ServeView from '../views/ServeView.vue'

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
  ],
})

export default router
