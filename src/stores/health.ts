import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { loadHealthLocal, saveHealthLocal } from '../lib/localdb'
import type { ScreenEntry, Workout } from '../lib/health'
import { useAuthStore } from './auth'

const localMode = !isSupabaseConfigured

export const useHealthStore = defineStore('health', () => {
  const screenTime = ref<ScreenEntry[]>([])
  const workouts = ref<Workout[]>([])
  const loaded = ref(false)

  function userId(): string {
    const auth = useAuthStore()
    if (!auth.user) throw new Error('未登录')
    return auth.user.id
  }

  function persistLocal() {
    saveHealthLocal({ screen_time: screenTime.value, workouts: workouts.value })
  }

  async function loadAll() {
    if (localMode) {
      const data = loadHealthLocal()
      screenTime.value = data.screen_time as ScreenEntry[]
      workouts.value = data.workouts as Workout[]
      loaded.value = true
      return
    }
    const [st, w] = await Promise.all([
      supabase.from('screen_time').select('*'),
      supabase.from('workouts').select('*').order('date'),
    ])
    if (st.error) throw st.error
    if (w.error) throw w.error
    screenTime.value = st.data
    workouts.value = w.data
    loaded.value = true
  }

  /** 保存某一天所有设备的屏幕时间（整天覆盖式更新） */
  async function saveScreenTime(date: string, entries: { device: string; minutes: number }[]) {
    if (localMode) {
      screenTime.value = [
        ...screenTime.value.filter((e) => e.date !== date),
        ...entries.map((e) => ({ ...e, date, id: crypto.randomUUID() })),
      ]
      persistLocal()
      return
    }
    const uid = userId()
    const rows = entries.map((e) => ({ ...e, date, user_id: uid }))
    const { data, error } = await supabase
      .from('screen_time')
      .upsert(rows, { onConflict: 'user_id,date,device' })
      .select()
    if (error) throw error
    const kept = screenTime.value.filter((e) => e.date !== date)
    screenTime.value = [...kept, ...data]
  }

  async function addWorkout(w: Omit<Workout, 'id' | 'source'>) {
    if (localMode) {
      workouts.value = [...workouts.value, { ...w, id: crypto.randomUUID(), source: 'manual' }]
      persistLocal()
      return
    }
    const { data, error } = await supabase
      .from('workouts')
      .insert({ ...w, user_id: userId() })
      .select()
      .single()
    if (error) throw error
    workouts.value = [...workouts.value, data]
  }

  async function deleteWorkout(id: string) {
    if (localMode) {
      workouts.value = workouts.value.filter((w) => w.id !== id)
      persistLocal()
      return
    }
    const { error } = await supabase.from('workouts').delete().eq('id', id)
    if (error) throw error
    workouts.value = workouts.value.filter((w) => w.id !== id)
  }

  /** 批量导入锻炼记录，按 日期+模式+时长 与已有记录去重；返回实际导入条数 */
  async function importWorkouts(items: Omit<Workout, 'id' | 'source'>[]) {
    const key = (w: { date: string; mode: string; duration_min: number }) =>
      `${w.date}|${w.mode}|${w.duration_min}`
    const existing = new Set(workouts.value.map(key))
    const fresh = items.filter((x) => {
      if (existing.has(key(x))) return false
      existing.add(key(x))
      return true
    })
    if (fresh.length === 0) return 0

    if (localMode) {
      workouts.value = [
        ...workouts.value,
        ...fresh.map((x) => ({ ...x, id: crypto.randomUUID(), source: 'import' as const })),
      ]
      persistLocal()
      return fresh.length
    }
    const uid = userId()
    const rows = fresh.map((x) => ({ ...x, user_id: uid, source: 'import' as const }))
    const { data, error } = await supabase.from('workouts').insert(rows).select()
    if (error) throw error
    workouts.value = [...workouts.value, ...data]
    return rows.length
  }

  function reset() {
    screenTime.value = []
    workouts.value = []
    loaded.value = false
  }

  return {
    screenTime,
    workouts,
    loaded,
    loadAll,
    saveScreenTime,
    addWorkout,
    deleteWorkout,
    importWorkouts,
    reset,
  }
})
