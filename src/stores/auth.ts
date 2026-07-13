import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const LOCAL_USER_KEY = 'menstruation-calc-local-user'

/** 本地模式的占位用户（未配置 Supabase 时） */
function localUser(): User {
  return { id: 'local', email: '本地模式' } as User
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const ready = ref(false)

  let initPromise: Promise<void> | null = null

  function init(): Promise<void> {
    if (initPromise) return initPromise
    if (!isSupabaseConfigured) {
      if (localStorage.getItem(LOCAL_USER_KEY)) user.value = localUser()
      ready.value = true
      initPromise = Promise.resolve()
      return initPromise
    }
    initPromise = supabase.auth.getSession().then(({ data }) => {
      user.value = data.session?.user ?? null
      ready.value = true
      supabase.auth.onAuthStateChange((_event, session) => {
        user.value = session?.user ?? null
      })
    })
    return initPromise
  }

  /** 本地模式：不经过 Supabase，直接进入应用 */
  function enterLocalMode() {
    localStorage.setItem(LOCAL_USER_KEY, '1')
    user.value = localUser()
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  async function signOut() {
    if (!isSupabaseConfigured) {
      localStorage.removeItem(LOCAL_USER_KEY)
      user.value = null
      return
    }
    await supabase.auth.signOut()
  }

  return { user, ready, init, enterLocalMode, signIn, signUp, signOut }
})
