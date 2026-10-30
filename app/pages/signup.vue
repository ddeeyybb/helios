<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useInstallerAuth, generateInitials } from '~/composables/useInstallerAuth'

definePageMeta({
  layout: false
})

useHead({
  title: 'Create Installer Account | HELIOS-LOAD Platform'
})

const router = useRouter()
const { signup } = useInstallerAuth()

const fullName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

// Real-time live initials preview from name input
const liveInitials = computed(() => {
  return generateInitials(fullName.value)
})

async function handleCreateAccount() {
  errorMessage.value = ''

  const trimmedName = fullName.value.trim()
  const trimmedEmail = email.value.trim().toLowerCase()
  const pass = password.value
  const confirmPass = confirmPassword.value

  // Simple, basic English validation
  if (!trimmedName) {
    errorMessage.value = 'Please enter your name.'
    return
  }

  if (!trimmedEmail) {
    errorMessage.value = 'Please enter your email.'
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(trimmedEmail)) {
    errorMessage.value = 'Please enter a valid email.'
    return
  }

  if (!pass) {
    errorMessage.value = 'Please enter a password.'
    return
  }

  if (!confirmPass || pass !== confirmPass) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  isSubmitting.value = true
  try {
    const res = await signup({
      fullName: trimmedName,
      role: 'Installer',
      email: trimmedEmail,
      password: pass
    })

    if (res.success) {
      await router.push('/dashboard')
    } else {
      errorMessage.value = res.error || 'Email or password is incorrect.'
    }
  } catch (err: any) {
    errorMessage.value = 'An error occurred. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
    <!-- Ambient Solar Accents -->
    <div class="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none"></div>

    <div class="w-full max-w-lg relative z-10 flex flex-col items-center my-6">
      <!-- Brand Header -->
      <div class="text-center mb-6 space-y-1.5">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-500/25 border border-blue-400/30 mb-2">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
          </svg>
        </div>
        <h1 class="text-2xl font-black tracking-tight text-white font-mono">Create Installer Account</h1>
        <p class="text-xs text-slate-400">Create an account to get started.</p>
      </div>

      <!-- Registration Form Card -->
      <div class="w-full bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-5">
        <!-- Live Avatar Initials Preview Card -->
        <div class="p-3.5 bg-slate-950/70 border border-slate-800/90 rounded-2xl flex items-center gap-3.5">
          <!-- Circular Avatar with Initials -->
          <div class="w-12 h-12 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-blue-500/40 text-blue-300 flex items-center justify-center font-bold text-sm tracking-wide shadow-inner shrink-0">
            {{ liveInitials }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold text-slate-200 truncate">
              {{ fullName.trim() || 'Your Name' }}
            </div>
            <div class="text-[11px] text-slate-400 truncate">
              Installer
            </div>
          </div>
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Online</span>
          </div>
        </div>

        <!-- Validation Error Alert -->
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

        <form @submit.prevent="handleCreateAccount" class="space-y-4" novalidate>
          <!-- Full Name -->
          <div class="space-y-1.5">
            <label for="full-name" class="block text-xs font-semibold text-slate-300">
              Full Name <span class="text-rose-400">*</span>
            </label>
            <input
              id="full-name"
              v-model="fullName"
              type="text"
              autocomplete="name"
              required
              placeholder="Enter your full name"
              class="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <!-- Email -->
          <div class="space-y-1.5">
            <label for="signup-email" class="block text-xs font-semibold text-slate-300">
              Email <span class="text-rose-400">*</span>
            </label>
            <input
              id="signup-email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              placeholder="Enter your email"
              class="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <!-- Password & Confirm Password in 2 Cols on Tablet+ -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div class="space-y-1.5">
              <label for="signup-password" class="block text-xs font-semibold text-slate-300">
                Password <span class="text-rose-400">*</span>
              </label>
              <div class="relative">
                <input
                  id="signup-password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  required
                  placeholder="Create a password"
                  class="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
                  tabindex="-1"
                >
                  <svg v-if="!showPassword" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="space-y-1.5">
              <label for="confirm-password" class="block text-xs font-semibold text-slate-300">
                Confirm Password <span class="text-rose-400">*</span>
              </label>
              <input
                id="confirm-password"
                v-model="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                required
                placeholder="Enter your password again"
                class="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isSubmitting"
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            <span v-if="isSubmitting" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            <span>{{ isSubmitting ? 'Creating Account...' : 'Create Installer Account' }}</span>
          </button>
        </form>

        <!-- Divider & Switch to Sign In -->
        <div class="pt-3 border-t border-slate-800 text-center space-y-2.5">
          <p class="text-xs text-slate-400">
            Already have an account?
          </p>
          <NuxtLink
            to="/login"
            class="inline-flex items-center justify-center w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold rounded-xl border border-slate-700/80 transition-colors"
          >
            Sign In
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
