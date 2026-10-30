import { defineNuxtRouteMiddleware, navigateTo } from '#app'
import { useInstallerAuth } from '~/composables/useInstallerAuth'

export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated, initAuth } = useInstallerAuth()

  // Ensure auth is initialized from cookies or storage
  initAuth()

  const isAuthPage = to.path === '/login' || to.path === '/signup'

  // If unauthenticated and attempting to access an installer page, redirect to /login
  if (!isAuthenticated.value && !isAuthPage) {
    return navigateTo('/login')
  }

  // If already authenticated and trying to visit login/signup, redirect to /dashboard
  if (isAuthenticated.value && isAuthPage) {
    return navigateTo('/dashboard')
  }
})
