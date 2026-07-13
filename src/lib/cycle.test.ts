import { describe, expect, it } from 'vitest'
import { analyzeCycles, markForDate, phaseForDate, todayStatus, type Period } from './cycle'

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function periodsFromStarts(starts: string[], durationDays = 5): Period[] {
  return starts.map((s) => ({ start_date: s, end_date: addDays(s, durationDays - 1) }))
}

describe('analyzeCycles', () => {
  it('规律周期：预测等于固定间隔', () => {
    // 每 28 天一次
    const periods = periodsFromStarts([
      '2026-01-01', '2026-01-29', '2026-02-26', '2026-03-26', '2026-04-23',
    ])
    const a = analyzeCycles(periods, { today: '2026-05-01' })

    expect(a.cycleLengths).toEqual([28, 28, 28, 28])
    expect(a.avgCycle).toBe(28)
    expect(a.sd).toBe(0)
    expect(a.insufficientData).toBe(false)
    expect(a.periodDays).toBe(5)
    expect(a.upcoming[0].periodStart).toBe('2026-05-21')
    expect(a.upcoming[0].periodEnd).toBe('2026-05-25')
    // 排卵 = 下次开始 - 14 天
    expect(a.upcoming[0].ovulation).toBe('2026-05-07')
    expect(a.upcoming[0].fertile).toEqual({ start: '2026-05-02', end: '2026-05-08' })
    // 滚动预测第二个周期
    expect(a.upcoming[1].periodStart).toBe('2026-06-18')
    expect(a.warnings).toEqual([])
  })

  it('不规律周期：加权平均偏向近期，且给出浮动窗口', () => {
    // 周期依次为 26, 30, 27, 31
    const periods = periodsFromStarts([
      '2026-01-01', '2026-01-27', '2026-02-26', '2026-03-25', '2026-04-25',
    ])
    const a = analyzeCycles(periods, { today: '2026-05-01' })

    expect(a.cycleLengths).toEqual([26, 30, 27, 31])
    // 加权平均 (26*1+30*2+27*3+31*4)/10 = 29.1
    expect(a.avgCycle).toBeCloseTo(29.1)
    expect(a.sd).toBeGreaterThan(1)
    // 浮动窗口至少 ±1 天且包住预测日
    const u = a.upcoming[0]
    expect(u.periodStart).toBe('2026-05-24') // 4/25 + round(29.1)=29 天
    expect(u.windowStart < u.periodStart).toBe(true)
    expect(u.windowEnd > u.periodStart).toBe(true)
  })

  it('异常值剔除：怀孕/漏记造成的超长间隔不参与预测', () => {
    // 中间漏记了两个月：出现一个 90 天的间隔
    const starts = ['2026-01-01', '2026-01-29', '2026-04-29', '2026-05-27', '2026-06-24']
    const a = analyzeCycles(periodsFromStarts(starts), { today: '2026-07-01' })

    expect(a.cycleLengths).toEqual([28, 90, 28, 28])
    expect(a.validLengths).toEqual([28, 28, 28])
    expect(a.avgCycle).toBe(28)
    expect(a.upcoming[0].periodStart).toBe('2026-07-22')
  })

  it('2σ 剔除：样本足够时偏离过大的周期被排除', () => {
    // 7 个周期，其中一个 40 天明显偏离其余 27~29
    const lengths = [28, 27, 29, 28, 40, 28, 27]
    const starts: string[] = ['2026-01-01']
    for (const len of lengths) {
      starts.push(addDays(starts[starts.length - 1], len))
    }
    const a = analyzeCycles(periodsFromStarts(starts), { today: starts[starts.length - 1] })
    expect(a.validLengths).not.toContain(40)
  })

  it('数据不足：单条记录时用默认 28 天并标记 insufficientData', () => {
    const a = analyzeCycles(periodsFromStarts(['2026-06-01']), { today: '2026-06-10' })
    expect(a.insufficientData).toBe(true)
    expect(a.avgCycle).toBe(28)
    expect(a.upcoming[0].periodStart).toBe('2026-06-29')
  })

  it('无记录：不产生预测', () => {
    const a = analyzeCycles([], { today: '2026-06-10' })
    expect(a.upcoming).toEqual([])
    expect(a.insufficientData).toBe(true)
  })

  it('健康提示：短周期与超长经期触发提醒', () => {
    const periods: Period[] = [
      { start_date: '2026-03-01', end_date: '2026-03-05' },
      { start_date: '2026-03-19', end_date: '2026-03-23' }, // 周期 18 天
      { start_date: '2026-04-06', end_date: '2026-04-14' }, // 经期 9 天
    ]
    const a = analyzeCycles(periods, { today: '2026-04-20' })
    expect(a.warnings.some((w) => w.includes('21 天'))).toBe(true)
    expect(a.warnings.some((w) => w.includes('7 天'))).toBe(true)
  })
})

describe('todayStatus', () => {
  const periods = periodsFromStarts([
    '2026-01-01', '2026-01-29', '2026-02-26', '2026-03-26', '2026-04-23',
  ])

  it('经期内：phase 为 period', () => {
    const a = analyzeCycles(periods, { today: '2026-04-25' })
    const s = todayStatus(a, '2026-04-25')
    expect(s.phase).toBe('period')
    expect(s.cycleDay).toBe(3)
    expect(s.inPeriod).toBe(true)
  })

  it('易孕期内：phase 为 fertile', () => {
    const a = analyzeCycles(periods, { today: '2026-05-07' })
    const s = todayStatus(a, '2026-05-07')
    expect(s.phase).toBe('fertile')
    expect(s.daysUntilNext).toBe(14)
  })

  it('排卵后：phase 为 luteal', () => {
    const a = analyzeCycles(periods, { today: '2026-05-15' })
    const s = todayStatus(a, '2026-05-15')
    expect(s.phase).toBe('luteal')
  })

  it('超过预测窗口仍未来：phase 为 overdue', () => {
    const a = analyzeCycles(periods, { today: '2026-05-28' })
    const s = todayStatus(a, '2026-05-28')
    expect(s.phase).toBe('overdue')
    expect(s.daysUntilNext).toBeLessThan(0)
  })

  it('进行中的经期（无 end_date）返回 ongoingPeriod', () => {
    const p: Period[] = [
      { start_date: '2026-04-23', end_date: null },
    ]
    const a = analyzeCycles(p, { today: '2026-04-25' })
    const s = todayStatus(a, '2026-04-25')
    expect(s.ongoingPeriod).not.toBeNull()
    expect(s.phase).toBe('period')
  })
})

describe('phaseForDate', () => {
  // 4/17 与 5/16 两次经期，周期 29 天：排卵 = 5/16 − 14 = 5/2，易孕期 4/27 ~ 5/3
  const periods = periodsFromStarts(['2026-04-17', '2026-05-16'])
  const a = analyzeCycles(periods, { today: '2026-05-20' })

  it('经期内 → period', () => {
    expect(phaseForDate('2026-04-19', a)).toBe('period')
  })
  it('经期后、易孕期前 → follicular', () => {
    expect(phaseForDate('2026-04-24', a)).toBe('follicular')
  })
  it('历史周期用真实下一次经期倒推易孕期 → fertile', () => {
    expect(phaseForDate('2026-04-28', a)).toBe('fertile')
    expect(phaseForDate('2026-05-03', a)).toBe('fertile')
  })
  it('排卵后 → luteal', () => {
    expect(phaseForDate('2026-05-08', a)).toBe('luteal')
  })
  it('下次经期前 3 天内 → pms', () => {
    expect(phaseForDate('2026-05-13', a)).toBe('pms')
    expect(phaseForDate('2026-05-15', a)).toBe('pms')
    expect(phaseForDate('2026-05-12', a)).toBe('luteal')
  })
  it('第一次记录之前 → unknown', () => {
    expect(phaseForDate('2026-04-10', a)).toBe('unknown')
  })
  it('漏记造成的超长间隔 → unknown', () => {
    const gappy = analyzeCycles(
      periodsFromStarts(['2026-01-01', '2026-04-01']),
      { today: '2026-04-10' },
    )
    expect(phaseForDate('2026-02-15', gappy)).toBe('unknown')
  })
  it('最后一个未完成周期退回预测：黄体期日期可判定', () => {
    // 最近经期 5/16，预测下次 6/14：排卵 5/31、易孕期 5/26~6/1，6/5 为 luteal
    expect(phaseForDate('2026-05-31', a)).toBe('fertile')
    expect(phaseForDate('2026-06-05', a)).toBe('luteal')
  })
})

describe('markForDate', () => {
  const periods = periodsFromStarts([
    '2026-03-26', '2026-04-23',
  ])
  const a = analyzeCycles(periods, { today: '2026-05-01' })

  it('实际经期日标记为 period', () => {
    expect(markForDate('2026-04-24', a)).toBe('period')
  })
  it('预测经期日标记为 predicted', () => {
    // 周期 28 天 → 下次 5/21~5/25
    expect(markForDate('2026-05-22', a)).toBe('predicted')
  })
  it('排卵日与易孕期标记正确', () => {
    expect(markForDate('2026-05-07', a)).toBe('ovulation')
    expect(markForDate('2026-05-03', a)).toBe('fertile')
  })
  it('普通日无标记', () => {
    expect(markForDate('2026-05-15', a)).toBe(null)
  })
})
