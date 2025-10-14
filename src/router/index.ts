import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CallbackView from '../views/CallbackView.vue'
import AdminView from '../views/AdminView.vue'
import LeaderView from '../views/LeaderView.vue'
import LeaderVolunteerView from '../views/LeaderVolunteerView.vue'

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
      component: AdminView,
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
  ],
})

export default router
