/**
 * 本地模式存储：未配置 Supabase 时，数据保存在 localStorage，
 * 应用完全可用（仅限当前设备，不跨设备同步）。
 */
const KEY = 'menstruation-calc-local'

export interface LocalData {
  periods: unknown[]
  logs: Record<string, unknown>
  settings: unknown | null
}

export function loadLocal(): LocalData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* 损坏则重置 */
  }
  return { periods: [], logs: {}, settings: null }
}

export function saveLocal(data: LocalData) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

/** 健康记录（屏幕时间 / 锻炼）单独一个 key，避免与周期数据互相覆盖 */
const HEALTH_KEY = 'menstruation-calc-health'

export interface LocalHealth {
  screen_time: unknown[]
  workouts: unknown[]
}

export function loadHealthLocal(): LocalHealth {
  try {
    const raw = localStorage.getItem(HEALTH_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* 损坏则重置 */
  }
  return { screen_time: [], workouts: [] }
}

export function saveHealthLocal(data: LocalHealth) {
  localStorage.setItem(HEALTH_KEY, JSON.stringify(data))
}
