import { describe, expect, it } from 'vitest'
import {
  recordStreak,
  screenMinutesByDate,
  weeklyReport,
  workoutMinutesByDate,
  type ScreenEntry,
  type Workout,
} from './health'
import { mapWorkoutRows } from './csv'

const W = (date: string, duration_min: number, mode = '跑步'): Workout => ({
  date,
  mode,
  duration_min,
  avg_hr: null,
  calories: null,
})
const S = (date: string, device: string, minutes: number): ScreenEntry => ({
  date,
  device,
  minutes,
})

describe('聚合', () => {
  it('按天合计屏幕分钟数（跨设备累加）', () => {
    const m = screenMinutesByDate([
      S('2026-07-13', '手机1', 120),
      S('2026-07-13', 'iPad', 60),
      S('2026-07-12', '手机1', 30),
    ])
    expect(m.get('2026-07-13')).toBe(180)
    expect(m.get('2026-07-12')).toBe(30)
  })

  it('按天合计锻炼分钟数（一天多次累加）', () => {
    const m = workoutMinutesByDate([W('2026-07-13', 30), W('2026-07-13', 20, '力量训练')])
    expect(m.get('2026-07-13')).toBe(50)
  })
})

describe('recordStreak', () => {
  it('从今天往回数连续天数', () => {
    const dates = new Set(['2026-07-13', '2026-07-12', '2026-07-11', '2026-07-08'])
    expect(recordStreak(dates, '2026-07-13')).toBe(3)
  })

  it('今天没记录则为 0', () => {
    expect(recordStreak(new Set(['2026-07-12']), '2026-07-13')).toBe(0)
  })
})

describe('weeklyReport', () => {
  // 2026-07-13 是周一
  const weekStart = '2026-07-13'

  it('无任何数据时给温和的开始建议', () => {
    const lines = weeklyReport({ weekStart, screen: [], workouts: [], dizziness: new Map() })
    expect(lines.join('')).toContain('散步')
  })

  it('锻炼比上周多时具体地夸', () => {
    const lines = weeklyReport({
      weekStart,
      screen: [],
      workouts: [W('2026-07-08', 30), W('2026-07-13', 40), W('2026-07-14', 20)],
      dizziness: new Map(),
    })
    expect(lines.join('')).toContain('多了 30 分钟')
  })

  it('屏幕时间减少时正向反馈，增加时只做中性陈述', () => {
    const fewer = weeklyReport({
      weekStart,
      screen: [S('2026-07-08', '手机1', 360), S('2026-07-13', '手机1', 240)],
      workouts: [],
      dizziness: new Map(),
    })
    expect(fewer.join('')).toContain('少了 2 小时')

    const more = weeklyReport({
      weekStart,
      screen: [S('2026-07-08', '手机1', 60), S('2026-07-13', '手机1', 240)],
      workouts: [],
      dizziness: new Map(),
    })
    const text = more.join('')
    expect(text).not.toMatch(/超标|警告|太多|过度/)
  })

  it('头晕天数减少时指出在变好；本周无头晕时庆祝', () => {
    const better = weeklyReport({
      weekStart,
      screen: [],
      workouts: [],
      dizziness: new Map([
        ['2026-07-08', 2],
        ['2026-07-09', 1],
        ['2026-07-13', 1],
        ['2026-07-14', 0],
      ]),
    })
    expect(better.join('')).toContain('减少到 1 天')

    const none = weeklyReport({
      weekStart,
      screen: [],
      workouts: [],
      dizziness: new Map([
        ['2026-07-13', 0],
        ['2026-07-14', 0],
      ]),
    })
    expect(none.join('')).toContain('一次头晕都没有')
  })
})

describe('mapWorkoutRows', () => {
  const rows = [
    ['2026-07-01 08:00:00', '跑步', '1800', '132', '256 千卡'],
    ['2026/07/02', '力量训练', '2700', '', ''],
    ['无效日期', '跑步', '600', '120', '100'],
    ['2026-07-03', '瑜伽', 'abc', '90', '80'],
  ]
  const cols = { date: 0, mode: 1, duration: 2, hr: 3, calories: 4 }

  it('按秒换算时长，容忍带单位的数字，无效行跳过', () => {
    const { ok, failed } = mapWorkoutRows(rows, { ...cols, durationUnit: 'seconds' })
    expect(failed).toBe(2)
    expect(ok).toEqual([
      { date: '2026-07-01', mode: '跑步', duration_min: 30, avg_hr: 132, calories: 256 },
      { date: '2026-07-02', mode: '力量训练', duration_min: 45, avg_hr: null, calories: null },
    ])
  })

  it('分钟单位不换算；未选模式列时归为其他', () => {
    const { ok } = mapWorkoutRows([['2026-07-01', '', '30', '', '']], {
      date: 0,
      duration: 2,
      durationUnit: 'minutes',
      mode: null,
      hr: null,
      calories: null,
    })
    expect(ok[0]).toEqual({
      date: '2026-07-01',
      mode: '其他',
      duration_min: 30,
      avg_hr: null,
      calories: null,
    })
  })
})
