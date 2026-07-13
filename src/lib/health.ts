/**
 * 健康记录的纯函数：聚合、连续打卡、周报文案。
 * 周报文案刻意"反焦虑"：只强调正向变化，其余用中性陈述，不出现警告式措辞。
 */
import dayjs from 'dayjs'

export interface ScreenEntry {
  id?: string
  date: string // YYYY-MM-DD
  device: string
  minutes: number
}

export interface Workout {
  id?: string
  date: string // YYYY-MM-DD
  mode: string
  duration_min: number
  avg_hr: number | null
  calories: number | null
  source?: 'manual' | 'import'
}

export const WORKOUT_MODES = ['力量训练', '跑步', '走路', 'HIIT', '瑜伽', '骑行', '跳绳', '其他']

export const DIZZINESS_LEVELS = [
  { value: 0, label: '没晕' },
  { value: 1, label: '轻微' },
  { value: 2, label: '明显' },
  { value: 3, label: '严重' },
]

/** 每天屏幕总分钟数 */
export function screenMinutesByDate(entries: ScreenEntry[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + e.minutes)
  return m
}

/** 每天锻炼总分钟数 */
export function workoutMinutesByDate(workouts: Workout[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const w of workouts) m.set(w.date, (m.get(w.date) ?? 0) + w.duration_min)
  return m
}

/** 以 today 为终点，往回数连续记录天数（dates 为有任意健康记录的日期集合） */
export function recordStreak(dates: Set<string>, today: string): number {
  let streak = 0
  let d = dayjs(today)
  while (dates.has(d.format('YYYY-MM-DD'))) {
    streak++
    d = d.subtract(1, 'day')
  }
  return streak
}

function fmtHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10
  return Number.isInteger(h) ? `${h} 小时` : `${h.toFixed(1)} 小时`
}

export interface WeekInput {
  /** 本周一的日期（YYYY-MM-DD），周报比较 [weekStart, weekStart+7) 与前一周 */
  weekStart: string
  screen: ScreenEntry[]
  workouts: Workout[]
  /** date -> 头晕程度 0~3（null/未记录的日期不传） */
  dizziness: Map<string, number>
}

/** 一段日期区间内的汇总 */
function summarize(
  input: Omit<WeekInput, 'weekStart'>,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
) {
  const inRange = (d: string) => {
    const x = dayjs(d)
    return !x.isBefore(start) && x.isBefore(end)
  }
  const screenMin = input.screen.filter((e) => inRange(e.date)).reduce((a, e) => a + e.minutes, 0)
  const workoutMin = input.workouts
    .filter((w) => inRange(w.date))
    .reduce((a, w) => a + w.duration_min, 0)
  const workoutDays = new Set(input.workouts.filter((w) => inRange(w.date)).map((w) => w.date))
    .size
  let dizzyDays = 0
  let dizzyRecorded = 0
  for (const [d, level] of input.dizziness) {
    if (!inRange(d)) continue
    dizzyRecorded++
    if (level > 0) dizzyDays++
  }
  return { screenMin, workoutMin, workoutDays, dizzyDays, dizzyRecorded }
}

/**
 * 生成温和的周报文案。规则：
 * - 有进步就具体地夸；
 * - 没进步用中性陈述，绝不出现"超标 / 恶化 / 警告"式语言；
 * - 数据不够时给出温和的开始建议。
 */
export function weeklyReport(input: WeekInput): string[] {
  const start = dayjs(input.weekStart)
  const end = start.add(7, 'day')
  const prevStart = start.subtract(7, 'day')

  const cur = summarize(input, start, end)
  const prev = summarize(input, prevStart, start)
  const lines: string[] = []

  // 锻炼
  if (cur.workoutMin === 0 && prev.workoutMin === 0) {
    lines.push('这周还没有锻炼记录，从 10 分钟散步开始就很好')
  } else if (prev.workoutMin === 0 && cur.workoutMin > 0) {
    lines.push(`这周动起来了：锻炼 ${cur.workoutDays} 天、共 ${cur.workoutMin} 分钟，很棒的开始`)
  } else if (cur.workoutMin > prev.workoutMin) {
    lines.push(`锻炼比上周多了 ${cur.workoutMin - prev.workoutMin} 分钟，继续保持`)
  } else if (cur.workoutMin > 0) {
    lines.push(`这周锻炼了 ${cur.workoutDays} 天、共 ${cur.workoutMin} 分钟，习惯还在`)
  }

  // 屏幕时间
  if (cur.screenMin > 0 || prev.screenMin > 0) {
    if (prev.screenMin > 0 && cur.screenMin < prev.screenMin) {
      lines.push(`屏幕时间比上周少了 ${fmtHours(prev.screenMin - cur.screenMin)}，眼睛和脖子都会感谢你`)
    } else if (prev.screenMin > 0 && cur.screenMin > prev.screenMin) {
      lines.push(`屏幕时间比上周多了一些（${fmtHours(cur.screenMin)}），记下来就是改变的开始`)
    } else if (cur.screenMin > 0) {
      lines.push(`这周屏幕时间共 ${fmtHours(cur.screenMin)}`)
    }
  }

  // 头晕
  if (cur.dizzyRecorded > 0) {
    if (cur.dizzyDays === 0) {
      lines.push('这周记录的日子里一次头晕都没有 🎉')
    } else if (prev.dizzyRecorded > 0 && cur.dizzyDays < prev.dizzyDays) {
      lines.push(`头晕的天数从上周 ${prev.dizzyDays} 天减少到 ${cur.dizzyDays} 天，在变好`)
    } else {
      lines.push(`这周有 ${cur.dizzyDays} 天头晕，可以在统计页看看它和屏幕、锻炼的关系`)
    }
  }

  return lines
}
