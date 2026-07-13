import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { loadLocal, saveLocal } from '../lib/localdb'
import { analyzeCycles, todayStatus, type Period } from '../lib/cycle'
import { useAuthStore } from './auth'

export interface DailyLog {
  id?: string
  date: string
  flow: 'light' | 'medium' | 'heavy' | null
  pain: number | null
  dizziness: number | null
  moods: string[]
  symptoms: string[]
  note: string | null
}

export interface Settings {
  luteal_days: number
  notify_days_before: number
  /** 屏幕时间统计的设备列表，可在设置中增删改名 */
  devices: string[]
  neck_reminder_enabled: boolean
  /** 颈椎提醒间隔（分钟） */
  neck_reminder_interval: number
}

const DEFAULT_SETTINGS: Settings = {
  luteal_days: 14,
  notify_days_before: 2,
  devices: ['手机1', '手机2', 'iPad', '电脑'],
  neck_reminder_enabled: false,
  neck_reminder_interval: 60,
}

/** 未配置 Supabase 时启用本地模式（localStorage 持久化） */
const localMode = !isSupabaseConfigured

export const useDataStore = defineStore('data', () => {
  const periods = ref<Period[]>([])
  const logs = ref<Record<string, DailyLog>>({})
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const loaded = ref(false)

  const analysis = computed(() =>
    analyzeCycles(periods.value, {
      lutealDays: settings.value.luteal_days,
      upcomingCount: 4,
    }),
  )
  const status = computed(() => todayStatus(analysis.value))

  function userId(): string {
    const auth = useAuthStore()
    if (!auth.user) throw new Error('未登录')
    return auth.user.id
  }

  function persistLocal() {
    saveLocal({
      periods: periods.value,
      logs: logs.value,
      settings: settings.value,
    })
  }

  async function loadAll() {
    if (localMode) {
      const data = loadLocal()
      periods.value = data.periods as Period[]
      logs.value = data.logs as Record<string, DailyLog>
      // 与默认值合并，兼容旧版本存下的字段不全的 settings
      if (data.settings) settings.value = { ...DEFAULT_SETTINGS, ...(data.settings as Settings) }
      loaded.value = true
      return
    }

    const [p, l, s] = await Promise.all([
      supabase.from('periods').select('*').order('start_date'),
      supabase.from('daily_logs').select('*'),
      supabase.from('settings').select('*').maybeSingle(),
    ])
    if (p.error) throw p.error
    if (l.error) throw l.error
    if (s.error) throw s.error

    periods.value = p.data
    logs.value = Object.fromEntries((l.data as DailyLog[]).map((x) => [x.date, x]))
    if (s.data) {
      settings.value = {
        luteal_days: s.data.luteal_days,
        notify_days_before: s.data.notify_days_before,
        devices: s.data.devices ?? DEFAULT_SETTINGS.devices,
        neck_reminder_enabled: s.data.neck_reminder_enabled ?? false,
        neck_reminder_interval:
          s.data.neck_reminder_interval ?? DEFAULT_SETTINGS.neck_reminder_interval,
      }
    }
    loaded.value = true
  }

  async function startPeriod(date: string) {
    if (periods.value.some((p) => p.start_date === date)) {
      throw new Error('这一天已有经期记录')
    }
    if (localMode) {
      periods.value = [
        ...periods.value,
        { id: crypto.randomUUID(), start_date: date, end_date: null, source: 'manual' },
      ]
      persistLocal()
      return
    }
    const { data, error } = await supabase
      .from('periods')
      .insert({ user_id: userId(), start_date: date, end_date: null })
      .select()
      .single()
    if (error) throw error
    periods.value = [...periods.value, data]
  }

  async function endPeriod(id: string, endDate: string) {
    if (localMode) {
      periods.value = periods.value.map((p) =>
        p.id === id ? { ...p, end_date: endDate } : p,
      )
      persistLocal()
      return
    }
    const { error } = await supabase
      .from('periods')
      .update({ end_date: endDate })
      .eq('id', id)
    if (error) throw error
    periods.value = periods.value.map((p) =>
      p.id === id ? { ...p, end_date: endDate } : p,
    )
  }

  async function deletePeriod(id: string) {
    if (localMode) {
      periods.value = periods.value.filter((p) => p.id !== id)
      persistLocal()
      return
    }
    const { error } = await supabase.from('periods').delete().eq('id', id)
    if (error) throw error
    periods.value = periods.value.filter((p) => p.id !== id)
  }

  /** 批量导入，按 start_date 与已有记录去重；返回实际导入条数 */
  async function importPeriods(items: { start_date: string; end_date: string | null }[]) {
    const existing = new Set(periods.value.map((p) => p.start_date))
    const fresh = items.filter((x) => !existing.has(x.start_date))
    if (fresh.length === 0) return 0

    if (localMode) {
      periods.value = [
        ...periods.value,
        ...fresh.map((x) => ({ ...x, id: crypto.randomUUID(), source: 'import' as const })),
      ]
      persistLocal()
      return fresh.length
    }
    const uid = userId()
    const rows = fresh.map((x) => ({ ...x, user_id: uid, source: 'import' as const }))
    const { data, error } = await supabase.from('periods').insert(rows).select()
    if (error) throw error
    periods.value = [...periods.value, ...data]
    return rows.length
  }

  async function upsertLog(log: DailyLog) {
    if (localMode) {
      logs.value = { ...logs.value, [log.date]: { ...log, id: log.id ?? crypto.randomUUID() } }
      persistLocal()
      return
    }
    const row = { ...log, user_id: userId() }
    const { data, error } = await supabase
      .from('daily_logs')
      .upsert(row, { onConflict: 'user_id,date' })
      .select()
      .single()
    if (error) throw error
    logs.value = { ...logs.value, [data.date]: data }
  }

  async function saveSettings(next: Settings) {
    if (localMode) {
      settings.value = { ...next }
      persistLocal()
      return
    }
    const { error } = await supabase
      .from('settings')
      .upsert({ user_id: userId(), ...next })
    if (error) throw error
    settings.value = { ...next }
  }

  function reset() {
    periods.value = []
    logs.value = {}
    settings.value = { ...DEFAULT_SETTINGS }
    loaded.value = false
  }

  return {
    periods,
    logs,
    settings,
    loaded,
    analysis,
    status,
    loadAll,
    startPeriod,
    endPeriod,
    deletePeriod,
    importPeriods,
    upsertLog,
    saveSettings,
    reset,
  }
})
