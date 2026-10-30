import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

export interface InstallerProfile {
  id: string
  fullName: string
  email: string
  role: string
  initials: string
}

export interface StoredInstallerAccount {
  profile: InstallerProfile
  passwordHash: string
}

const AUTH_COOKIE_KEY = 'helios_installer_session'
const ACCOUNTS_STORAGE_KEY = 'helios_installer_registered_accounts'

/**
 * Generate professional initials from an installer's full name.
 * Strips common engineering/honorific titles (Engr., Dr., Prof., etc.)
 * Examples:
 * - "Engr. Marcus Vance" -> "MV"
 * - "John Doe" -> "JD"
 * - "Maria Santos" -> "MS"
 * - "Carlo Reyes" -> "CR"
 */
export function generateInitials(fullName: string): string {
  if (!fullName) return 'PV'
  const clean = fullName
    .replace(/^(engr\.?|dr\.?|mr\.?|ms\.?|mrs\.?|prof\.?)\s+/i, '')
    .trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'PV'
  if (parts.length === 1) {
    const single = parts[0]!
    return single.length >= 2 ? single.slice(0, 2).toUpperCase() : single.toUpperCase()
  }
  const first = parts[0]![0]!
  const last = parts[parts.length - 1]![0]!
  return (first + last).toUpperCase()
}

export function useInstallerAuth() {
  const router = useRouter()
  const sessionCookie = useCookie<InstallerProfile | null>(AUTH_COOKIE_KEY, {
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax',
    default: () => null
  })

  // Nuxt SSR-safe reactive state per request
  const currentInstaller = useState<InstallerProfile | null>('helios_installer_user', () => {
    if (sessionCookie.value && sessionCookie.value.id) {
      return { ...sessionCookie.value, role: 'Installer' }
    }
    return null
  })

  // Hydrate state from cookie or localStorage
  function initAuth() {
    if (sessionCookie.value && sessionCookie.value.id) {
      sessionCookie.value.role = 'Installer'
      currentInstaller.value = sessionCookie.value
      return
    }

    if (import.meta.client) {
      try {
        const stored = localStorage.getItem(AUTH_COOKIE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as InstallerProfile
          if (parsed && parsed.id) {
            parsed.role = 'Installer'
            currentInstaller.value = parsed
            sessionCookie.value = parsed
          }
        }
      } catch {
        // Ignore parse error
      }
    }
  }

  // Ensure initialized from cookie
  if (!currentInstaller.value && sessionCookie.value && sessionCookie.value.id) {
    sessionCookie.value.role = 'Installer'
    currentInstaller.value = sessionCookie.value
  }

  const isAuthenticated = computed(() => !!currentInstaller.value)
  const installer = computed(() => currentInstaller.value)

  /**
   * Helper to retrieve all locally registered accounts (temporary frontend storage)
   */
  function getRegisteredAccounts(): StoredInstallerAccount[] {
    if (!import.meta.client) return []
    try {
      const data = localStorage.getItem(ACCOUNTS_STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  function saveRegisteredAccounts(accounts: StoredInstallerAccount[]) {
    if (!import.meta.client) return
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
    } catch {}
  }

  /**
   * Sign up a new installer profile (temporary frontend-only)
   * The role is fixed and automatically assigned as 'Installer'.
   */
  async function signup(data: {
    fullName: string
    email: string
    password: string
    role?: string
  }): Promise<{ success: boolean; error?: string }> {
    const trimmedName = (data.fullName || '').trim()
    const trimmedEmail = (data.email || '').trim().toLowerCase()
    const password = data.password || ''

    if (!trimmedName) {
      return { success: false, error: 'Please enter your name.' }
    }
    if (!trimmedEmail) {
      return { success: false, error: 'Please enter your email.' }
    }
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      return { success: false, error: 'Please enter a valid email.' }
    }
    if (!password) {
      return { success: false, error: 'Please enter a password.' }
    }

    const initials = generateInitials(trimmedName)
    const newProfile: InstallerProfile = {
      id: `inst-${Date.now().toString(36)}`,
      fullName: trimmedName,
      email: trimmedEmail,
      role: 'Installer',
      initials
    }

    // Persist to temporary client accounts list
    if (import.meta.client) {
      const accounts = getRegisteredAccounts()
      // Remove previous duplicate if existing
      const filtered = accounts.filter(a => a.profile.email !== trimmedEmail)
      filtered.push({
        profile: newProfile,
        passwordHash: password
      })
      saveRegisteredAccounts(filtered)

      try {
        localStorage.setItem(AUTH_COOKIE_KEY, JSON.stringify(newProfile))
      } catch {}
    }

    sessionCookie.value = newProfile
    currentInstaller.value = newProfile

    return { success: true }
  }

  /**
   * Log in an existing installer (temporary frontend-only)
   */
  async function login(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    const trimmedEmail = (email || '').trim().toLowerCase()
    const trimmedPassword = password || ''

    if (!trimmedEmail) {
      return { success: false, error: 'Please enter your email.' }
    }
    if (!trimmedPassword) {
      return { success: false, error: 'Please enter your password.' }
    }

    // Check against registered accounts in browser storage
    const accounts = getRegisteredAccounts()
    const matched = accounts.find(
      a => a.profile.email.toLowerCase() === trimmedEmail && a.passwordHash === trimmedPassword
    )

    if (matched) {
      const profile: InstallerProfile = {
        ...matched.profile,
        role: 'Installer'
      }
      currentInstaller.value = profile
      sessionCookie.value = profile
      if (import.meta.client) {
        try {
          localStorage.setItem(AUTH_COOKIE_KEY, JSON.stringify(profile))
        } catch {}
      }
      return { success: true }
    }

    // Standard development installer fallback if user tests default dev account
    if (
      trimmedEmail === 'installer@heliosload.engineering' ||
      trimmedEmail === 'installer@example.com' ||
      trimmedEmail === 'marcus.vance@heliosload.engineering'
    ) {
      const defaultProfile: InstallerProfile = {
        id: 'inst-dev-default',
        fullName: 'Engr. Marcus Vance',
        email: trimmedEmail,
        role: 'Installer',
        initials: 'MV'
      }
      currentInstaller.value = defaultProfile
      sessionCookie.value = defaultProfile
      if (import.meta.client) {
        try {
          localStorage.setItem(AUTH_COOKIE_KEY, JSON.stringify(defaultProfile))
        } catch {}
      }
      return { success: true }
    }

    return { success: false, error: 'Email or password is incorrect.' }
  }

  /**
   * Log out the current installer session
   */
  function logout() {
    currentInstaller.value = null
    sessionCookie.value = null

    if (import.meta.client) {
      try {
        localStorage.removeItem(AUTH_COOKIE_KEY)
      } catch {}
    }

    if (router) {
      router.push('/login')
    }
  }

  return {
    isAuthenticated,
    installer,
    initAuth,
    login,
    signup,
    logout,
    generateInitials
  }
}
