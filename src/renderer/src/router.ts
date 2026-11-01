import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/data', component: () => import('./views/DataView.vue') },
    { path: '/text', component: () => import('./views/TextView.vue') },
    { path: '/library', component: () => import('./views/LibraryView.vue') },
    { path: '/settings', component: () => import('./views/SettingsView.vue') }
  ]
})
