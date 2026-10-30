<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useInstallerAuth } from '~/composables/useInstallerAuth'

definePageMeta({
  layout: false
})

useHead({
  title: 'Installer Login | HELIOS-LOAD Platform'
})

const router = useRouter()
const { login } = useInstallerAuth()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

async function handleSignIn() {
  errorMessage.value = ''
  const trimmedEmail = email.value.trim()
  const trimmedPass = password.value

  if (!trimmedEmail) {
    errorMessage.value = 'Please enter your email.'
    return
  }
  if (!trimmedPass) {
    errorMessage.value = 'Please enter your password.'
    return
  }

  isSubmitting.value = true
  try {
    const result = await login(trimmedEmail, trimmedPass)
    if (result.success) {
      await router.push('/dashboard')
    } else {
      errorMessage.value = result.error || 'Email or password is incorrect.'
    }
  } catch (err: any) {
    errorMessage.value = 'Email or password is incorrect.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
    <!-- Ambient Solar Radial Background Accents -->
    <div class="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-blue-900/10 rounded-full blur-[120px] pointer-events-none"></div>

    <!-- Main Card Container -->
    <div class="w-full max-w-md relative z-10 flex flex-col items-center">
      <!-- Brand Header -->
      <div class="text-center mb-8 space-y-2">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-500/25 border border-blue-400/30 mb-2">
          <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        </div>
        <div class="flex items-center justify-center gap-2">
          <h1 class="text-2xl font-black tracking-tight text-white font-mono">HELIOS-LOAD</h1>
          <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-700/50">PV CAD</span>
        </div>
        <p class="text-xs uppercase tracking-widest text-slate-400 font-semibold">Installer Portal</p>
      </div>

      <!-- Login Form Card -->
      <div class="w-full bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-6">
        <div>
          <h2 class="text-lg font-bold text-white tracking-tight">Sign In</h2>
          <p class="text-xs text-slate-400 mt-1">Sign in to your installer account.</p>
        </div>

        <!-- Error Alert -->
        <div
          v-if="errorMessage"
          class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn"
          role="alert"
        >
          <svg class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div class="flex-1 font-medium leading-relaxed">{{ errorMessage }}</div>
        </div>

        <form @submit.prevent="handleSignIn" class="space-y-4.5" novalidate>
          <!-- Email Field -->
          <div class="space-y-1.5">
            <label for="installer-email" class="block text-xs font-semibold text-slate-300">
              Email
            </label>
            <div class="relative">
              <input
                id="installer-email"
                v-model="email"
                type="email"
                autocomplete="email"
                required
                placeholder="Enter your email"
                class="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                :class="{ 'border-rose-500/50 focus:ring-rose-500': errorMessage }"
              />
              <div class="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-500">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Password Field -->
          <div class="space-y-1.5">
            <label for="installer-password" class="block text-xs font-semibold text-slate-300">
              Password
            </label>
            <div class="relative">
              <input
                id="installer-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                required
                placeholder="Enter your password"
                class="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10"
                :class="{ 'border-rose-500/50 focus:ring-rose-500': errorMessage }"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
                tabindex="-1"
                :title="showPassword ? 'Hide password' : 'Show password'"
              >
                <svg v-if="!showPassword" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" x2="22" y1="2" y2="22" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isSubmitting"
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            <span v-if="isSubmitting" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            <span>{{ isSubmitting ? 'Signing in...' : 'Sign In' }}</span>
          </button>
        </form>

        <!-- Divider & Switch to Sign-Up -->
        <div class="pt-4 border-t border-slate-800 text-center space-y-3">
          <p class="text-xs text-slate-400">
            Don't have an account?
          </p>
          <NuxtLink
            to="/signup"
            class="inline-flex items-center justify-center w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold rounded-xl border border-slate-700/80 transition-colors"
          >
            Create Account
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
