import dayjs from 'dayjs'

export interface Period {
  id?: string
  start_date: string // YYYY-MM-DD
  end_date: string | null // null 表示进行中
  source?: 'manual' | 'import'
  note?: string | null
}

export interface DateRange {
  start: string
  end: string
}

export interface CyclePrediction {
  periodStart: string
  periodEnd: string
  /** 预测浮动区间：最早/最晚可能的开始日 */
  windowStart: string
  windowEnd: string
  ovulation: string
  fertile: DateRange
}

export type Phase = 'period' | 'follicular' | 'fertile' | 'luteal' | 'overdue' | 'unknown'

export interface CycleAnalysis {
  /** 按开始日升序排序后的记录 */
  periods: Period[]
  /** 相邻经期开始日之差（天），与 periods[i]→periods[i+1] 对应 */
  cycleLengths: number[]
  /** 参与预测的有效周期长度 */
  validLengths: number[]
  /** 预测用平均周期（加权），数据不足时为默认 28 */
  avgCycle: number
  /** 有效周期标准差（不足 2 个有效周期时为 0） */
  sd: number
  /** 经期天数（历史中位数），无数据时默认 5 */
  periodDays: number
  /** 数据不足（有效周期 < 2），预测仅供参考 */
  insufficientData: boolean
  /** 未来若干个周期的预测 */
  upcoming: CyclePrediction[]
  /** 健康提示文案 */
  warnings: string[]
}

export const DEFAULT_CYCLE = 28
export const DEFAULT_PERIOD_DAYS = 5
const MIN_PLAUSIBLE_CYCLE = 15
const MAX_PLAUSIBLE_CYCLE = 60
const MAX_RECENT_CYCLES = 6

const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')

export function sortPeriods(periods: Period[]): Period[] {
  return [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date))
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1))
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * 从有效周期中挑出参与预测的最近若干个，并做加权平均（越近权重越高）。
 */
function weightedAverage(lengths: number[]): number {
  const recent = lengths.slice(-MAX_RECENT_CYCLES)
  let sum = 0
  let wsum = 0
  recent.forEach((len, i) => {
    const w = i + 1
    sum += len * w
    wsum += w
  })
  return sum / wsum
}

/**
 * 剔除异常周期：先去掉生理上不合理的（<15 或 >60 天），
 * 若剩余样本足够（≥4），再去掉偏离均值超过 2 个标准差的。
 */
function filterValidLengths(lengths: number[]): number[] {
  const plausible = lengths.filter(
    (l) => l >= MIN_PLAUSIBLE_CYCLE && l <= MAX_PLAUSIBLE_CYCLE,
  )
  if (plausible.length < 4) return plausible
  const m = mean(plausible)
  const sd = stddev(plausible)
  if (sd === 0) return plausible
  return plausible.filter((l) => Math.abs(l - m) <= 2 * sd)
}

export function analyzeCycles(
  rawPeriods: Period[],
  options: { lutealDays?: number; upcomingCount?: number; today?: string } = {},
): CycleAnalysis {
  const lutealDays = options.lutealDays ?? 14
  const upcomingCount = options.upcomingCount ?? 3
  const today = dayjs(options.today ?? undefined).startOf('day')

  const periods = sortPeriods(rawPeriods)
  const cycleLengths: number[] = []
  for (let i = 1; i < periods.length; i++) {
    cycleLengths.push(
      dayjs(periods[i].start_date).diff(dayjs(periods[i - 1].start_date), 'day'),
    )
  }

  const validLengths = filterValidLengths(cycleLengths)
  const insufficientData = validLengths.length < 2
  const avgCycle =
    validLengths.length > 0 ? weightedAverage(validLengths) : DEFAULT_CYCLE
  const sd = stddev(validLengths.slice(-MAX_RECENT_CYCLES))

  const durations = periods
    .filter((p) => p.end_date)
    .map((p) => dayjs(p.end_date!).diff(dayjs(p.start_date), 'day') + 1)
    .filter((d) => d >= 1 && d <= 15)
  const periodDays = durations.length > 0 ? Math.round(median(durations)) : DEFAULT_PERIOD_DAYS

  // 从最后一次经期开始日向后滚动预测
  const upcoming: CyclePrediction[] = []
  const last = periods[periods.length - 1]
  if (last) {
    const window = Math.max(1, Math.round(sd)) // 至少 ±1 天
    let base = dayjs(last.start_date)
    // 若预测日已过（今天已超过 base+avg），仍从上一次实际记录推，第一条会标记为 overdue
    for (let i = 0; i < upcomingCount; i++) {
      base = base.add(Math.round(avgCycle), 'day')
      const ovulation = base.subtract(lutealDays, 'day')
      upcoming.push({
        periodStart: fmt(base),
        periodEnd: fmt(base.add(periodDays - 1, 'day')),
        windowStart: fmt(base.subtract(window, 'day')),
        windowEnd: fmt(base.add(window, 'day')),
        ovulation: fmt(ovulation),
        fertile: {
          start: fmt(ovulation.subtract(5, 'day')),
          end: fmt(ovulation.add(1, 'day')),
        },
      })
    }
  }

  const warnings: string[] = []
  const recentValid = validLengths.slice(-MAX_RECENT_CYCLES)
  if (recentValid.some((l) => l < 21)) {
    warnings.push('最近有周期短于 21 天，若持续如此建议咨询医生')
  }
  if (recentValid.some((l) => l > 35)) {
    warnings.push('最近有周期长于 35 天，若持续如此建议咨询医生')
  }
  const lastDuration = durations[durations.length - 1]
  if (lastDuration && lastDuration > 7) {
    warnings.push('上次经期超过 7 天，若持续如此建议咨询医生')
  }
  if (last && !last.end_date) {
    const ongoing = today.diff(dayjs(last.start_date), 'day') + 1
    if (ongoing > 10) {
      warnings.push('本次经期已记录超过 10 天且未标记结束，记得点"经期结束"')
    }
  }

  return {
    periods,
    cycleLengths,
    validLengths,
    avgCycle,
    sd,
    periodDays,
    insufficientData,
    upcoming,
    warnings,
  }
}

export interface TodayStatus {
  /** 当前周期第几天（从最近一次经期开始日算起，第 1 天） */
  cycleDay: number | null
  phase: Phase
  /** 距预测下次经期的天数（负数表示已推迟） */
  daysUntilNext: number | null
  nextPrediction: CyclePrediction | null
  /** 今天是否处于一段实际记录的经期内 */
  inPeriod: boolean
  /** 进行中的经期记录（未标记结束） */
  ongoingPeriod: Period | null
}

export function todayStatus(
  analysis: CycleAnalysis,
  todayStr?: string,
): TodayStatus {
  const today = dayjs(todayStr ?? undefined).startOf('day')
  const { periods, upcoming, periodDays } = analysis
  const last = periods[periods.length - 1]

  if (!last) {
    return {
      cycleDay: null,
      phase: 'unknown',
      daysUntilNext: null,
      nextPrediction: null,
      inPeriod: false,
      ongoingPeriod: null,
    }
  }

  const cycleDay = today.diff(dayjs(last.start_date), 'day') + 1

  const inPeriod = periods.some((p) => {
    const start = dayjs(p.start_date)
    const end = p.end_date
      ? dayjs(p.end_date)
      : start.add(periodDays - 1, 'day')
    return !today.isBefore(start) && !today.isAfter(end)
  })
  const ongoingPeriod = !last.end_date && cycleDay >= 1 ? last : null

  // 在记录到新经期之前，第一个预测始终是"下一次"；已过期则表现为推迟
  const next = upcoming[0] ?? null
  const daysUntilNext = next ? dayjs(next.periodStart).diff(today, 'day') : null

  let phase: Phase = 'unknown'
  if (inPeriod) {
    phase = 'period'
  } else if (next) {
    const fertileStart = dayjs(next.fertile.start)
    const fertileEnd = dayjs(next.fertile.end)
    if (daysUntilNext !== null && daysUntilNext < 0) {
      phase = 'overdue'
    } else if (!today.isBefore(fertileStart) && !today.isAfter(fertileEnd)) {
      phase = 'fertile'
    } else if (today.isBefore(fertileStart)) {
      phase = 'follicular'
    } else {
      phase = 'luteal'
    }
  }

  return { cycleDay, phase, daysUntilNext, nextPrediction: next, inPeriod, ongoingPeriod }
}

export type HistoricalPhase = Exclude<Phase, 'overdue'> | 'pms'

/**
 * 判断一个（历史）日期处于哪个周期阶段，用于回顾性统计。
 * 与 todayStatus 不同：历史周期用真实记录的下一次经期开始日倒推排卵，
 * 只有最后一个未完成的周期才退回到预测值。
 */
export function phaseForDate(
  date: string,
  analysis: CycleAnalysis,
  options: { lutealDays?: number; pmsDays?: number } = {},
): HistoricalPhase {
  const lutealDays = options.lutealDays ?? 14
  const pmsDays = options.pmsDays ?? 3
  const { periods, periodDays, upcoming } = analysis
  const d = dayjs(date)

  for (const p of periods) {
    const start = dayjs(p.start_date)
    const end = p.end_date ? dayjs(p.end_date) : start.add(periodDays - 1, 'day')
    if (!d.isBefore(start) && !d.isAfter(end)) return 'period'
  }

  // 所在周期 = 最后一个开始日不晚于该日期的经期
  let idx = -1
  for (let i = 0; i < periods.length; i++) {
    if (dayjs(periods[i].start_date).isAfter(d)) break
    idx = i
  }
  if (idx === -1) return 'unknown'

  const nextStart = periods[idx + 1]?.start_date ?? upcoming[0]?.periodStart
  if (!nextStart) return 'unknown'
  const cycleLen = dayjs(nextStart).diff(dayjs(periods[idx].start_date), 'day')
  // 间隔过长说明中间漏记，阶段划分不可信
  if (cycleLen > MAX_PLAUSIBLE_CYCLE) return 'unknown'

  if (dayjs(nextStart).diff(d, 'day') <= pmsDays) return 'pms'
  const ovulation = dayjs(nextStart).subtract(lutealDays, 'day')
  const fertileStart = ovulation.subtract(5, 'day')
  if (!d.isBefore(fertileStart) && !d.isAfter(ovulation.add(1, 'day'))) return 'fertile'
  return d.isBefore(fertileStart) ? 'follicular' : 'luteal'
}

export type DayMark = 'period' | 'predicted' | 'fertile' | 'ovulation' | null

/**
 * 日历用：判断某一天应显示的标记。实际经期优先于一切预测标记。
 */
export function markForDate(date: string, analysis: CycleAnalysis): DayMark {
  const d = dayjs(date)
  const { periods, upcoming, periodDays } = analysis

  for (const p of periods) {
    const start = dayjs(p.start_date)
    const end = p.end_date ? dayjs(p.end_date) : start.add(periodDays - 1, 'day')
    if (!d.isBefore(start) && !d.isAfter(end)) return 'period'
  }
  for (const u of upcoming) {
    if (date === u.ovulation) return 'ovulation'
    if (!d.isBefore(dayjs(u.fertile.start)) && !d.isAfter(dayjs(u.fertile.end))) {
      return 'fertile'
    }
    if (!d.isBefore(dayjs(u.periodStart)) && !d.isAfter(dayjs(u.periodEnd))) {
      return 'predicted'
    }
  }
  return null
}
