import { createRouter, createWebHistory } from 'vue-router'
import CheckoutView from '../views/CheckoutView.vue'
import CompareView from '../views/CompareView.vue'
import HomeView from '../views/HomeView.vue'
import MedicationsView from '../views/MedicationsView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import OrderView from '../views/OrderView.vue'
import PrescriptionCardView from '../views/PrescriptionCardView.vue'
import { updatePageMetadata } from '../utils/page-metadata'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (to, from) => to.path === '/drugs/explore' && from.path === to.path ? false : { top: 0 },
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/medications', name: 'medications', component: MedicationsView },
    { path: '/medications/:slug', name: 'medication-detail', component: () => import('../views/MedicationDetailView.vue') },
    { path: '/drugs/explore', name: 'drug-explorer', component: () => import('../views/DrugExplorerView.vue') },
    { path: '/compare', name: 'compare', component: CompareView },
    { path: '/prescription-card', name: 'prescription-card', component: PrescriptionCardView },
    { path: '/checkout', name: 'checkout', component: CheckoutView },
    { path: '/orders/:id', name: 'order', component: OrderView },
    { path: '/webmcp', name: 'webmcp', component: () => import('../views/WebMcpView.vue') },
    { path: '/hackathon', name: 'hackathon', component: () => import('../views/HackathonView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
})

router.afterEach(to => updatePageMetadata(to.path))
