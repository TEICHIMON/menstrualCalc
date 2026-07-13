/**
 * 颈椎休息提醒：应用打开期间，每隔设定的分钟数提醒起来活动。
 * 有通知权限时用系统通知，否则用应用内横幅。
 * 仅在 9:00 ~ 21:00 之间提醒；受浏览器后台节流限制，页面完全关闭时不会提醒。
 */
import { showNotify } from 'vant'

const LAST_KEY = 'menstruation-calc-neck-last'
const ACTIVE_START_HOUR = 9
const ACTIVE_END_HOUR = 21

const MESSAGES = [
  '起来活动一下吧，慢慢转转脖子、看看远处 🙆',
  '休息时间到，站起来伸个懒腰，肩膀放松下沉',
  '给脖子放个小假：低头 5 秒、抬头 5 秒，各来 3 次',
  '离开屏幕半分钟，望向窗外最远的地方',
]

let timer: ReturnType<typeof setInterval> | undefined

export interface NeckReminderConfig {
  enabled: boolean
  /** 分钟 */
  interval: number
}

export function setupNeckReminder(getConfig: () => NeckReminderConfig) {
  clearInterval(timer)
  timer = setInterval(() => check(getConfig()), 60_000)
}

function check(cfg: NeckReminderConfig) {
  if (!cfg.enabled) return
  const hour = new Date().getHours()
  if (hour < ACTIVE_START_HOUR || hour >= ACTIVE_END_HOUR) return
  const last = Number(localStorage.getItem(LAST_KEY) ?? 0)
  if (Date.now() - last < cfg.interval * 60_000) return
  localStorage.setItem(LAST_KEY, String(Date.now()))
  notify(MESSAGES[Math.floor(Math.random() * MESSAGES.length)])
}

function notify(message: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('颈椎休息时间', { body: message, tag: 'neck-reminder' })
      return
    } catch {
      /* 某些移动端不支持构造 Notification，退回应用内提示 */
    }
  }
  showNotify({ type: 'primary', message, duration: 6000 })
}

/** 开启提醒时请求通知权限；返回是否拿到系统通知权限（拿不到也能用应用内横幅） */
export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}
