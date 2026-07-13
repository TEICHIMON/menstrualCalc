<script setup lang="ts">
import { computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { showNotify } from 'vant'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useDataStore } from '../stores/data'
import { useHealthStore } from '../stores/health'
import { screenMinutesByDate, workoutMinutesByDate } from '../lib/health'
import { phaseForDate, type HistoricalPhase } from '../lib/cycle'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  MarkAreaComponent,
  MarkLineComponent,
  LegendComponent,
])

const data = useDataStore()
const health = useHealthStore()

onMounted(async () => {
  try {
    if (!data.loaded) await data.loadAll()
    if (!health.loaded) await health.loadAll()
  } catch (e) {
    showNotify({ type: 'danger', message: '加载数据失败：' + (e as Error).message })
  }
})

const PINK = '#ee5a7d'

/** 周期长度趋势：x 为每个周期的开始日 */
const cycleOption = computed(() => {
  const { periods, cycleLengths } = data.analysis
  const labels = periods.slice(0, -1).map((p) => dayjs(p.start_date).format('YY/MM/DD'))
  return {
    grid: { left: 36, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', min: 'dataMin', max: 'dataMax', name: '天' },
    series: [
      {
        type: 'line',
        data: cycleLengths,
        smooth: true,
        symbolSize: 6,
        itemStyle: { color: PINK },
        lineStyle: { color: PINK },
        areaStyle: { color: 'rgba(238, 90, 125, 0.08)' },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { position: 'insideEndTop', fontSize: 10 },
          lineStyle: { type: 'dashed', color: '#bbb' },
          data: [
            { yAxis: 21, label: { formatter: '21 天' } },
            { yAxis: 35, label: { formatter: '35 天' } },
          ],
        },
      },
    ],
  }
})

/** 经期天数：只统计已标记结束的记录 */
const durationOption = computed(() => {
  const items = data.analysis.periods
    .filter((p) => p.end_date)
    .map((p) => ({
      label: dayjs(p.start_date).format('YY/MM/DD'),
      days: dayjs(p.end_date!).diff(dayjs(p.start_date), 'day') + 1,
    }))
  return {
    grid: { left: 36, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: items.map((i) => i.label), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', name: '天' },
    series: [
      {
        type: 'bar',
        data: items.map((i) => i.days),
        itemStyle: { color: PINK, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 22,
      },
    ],
  }
})

/** 心情 × 周期阶段：每个阶段内各心情的占比（百分比堆叠条形图） */
const PHASE_ORDER: { key: HistoricalPhase; label: string }[] = [
  { key: 'period', label: '经期' },
  { key: 'follicular', label: '卵泡期' },
  { key: 'fertile', label: '易孕期' },
  { key: 'luteal', label: '黄体期' },
  { key: 'pms', label: '经前期' },
]
const MOOD_COLORS: Record<string, string> = {
  开心: '#f6b02c',
  平静: '#63b98a',
  疲惫: '#9aa0a6',
  烦躁: '#ef7d54',
  低落: '#7b8cd6',
  焦虑: '#b57bd6',
}

const moodPhase = computed(() => {
  const counts = new Map<HistoricalPhase, Map<string, number>>()
  const lutealDays = data.settings.luteal_days
  for (const log of Object.values(data.logs)) {
    if (log.moods.length === 0) continue
    const phase = phaseForDate(log.date, data.analysis, { lutealDays })
    if (phase === 'unknown') continue
    const bucket = counts.get(phase) ?? new Map<string, number>()
    for (const m of log.moods) bucket.set(m, (bucket.get(m) ?? 0) + 1)
    counts.set(phase, bucket)
  }
  return counts
})

const moodPhaseOption = computed(() => {
  const counts = moodPhase.value
  const phases = PHASE_ORDER.filter((p) => counts.has(p.key))
  const totals = phases.map((p) =>
    [...counts.get(p.key)!.values()].reduce((a, b) => a + b, 0),
  )
  const moods = [...new Set([...counts.values()].flatMap((m) => [...m.keys()]))]
  const known = Object.keys(MOOD_COLORS)
  moods.sort((a, b) => known.indexOf(a) - known.indexOf(b))

  return {
    grid: { left: 54, right: 20, top: 36, bottom: 24 },
    legend: { top: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11 } },
    tooltip: {
      trigger: 'axis',
      formatter: (params: { seriesName: string; dataIndex: number; marker: string; axisValueLabel?: string }[]) => {
        const lines = params
          .map((p) => {
            const raw = counts.get(phases[p.dataIndex].key)?.get(p.seriesName) ?? 0
            if (!raw) return ''
            const pct = Math.round((raw / totals[p.dataIndex]) * 100)
            return `${p.marker}${p.seriesName}：${raw} 次（${pct}%）`
          })
          .filter(Boolean)
        return `${phases[params[0].dataIndex].label}（共 ${totals[params[0].dataIndex]} 次）<br>${lines.join('<br>')}`
      },
    },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: {
      type: 'category',
      data: phases.map((p) => p.label),
      inverse: true,
      axisLabel: { fontSize: 12 },
    },
    series: moods.map((mood) => ({
      name: mood,
      type: 'bar',
      stack: 'mood',
      barMaxWidth: 18,
      itemStyle: { color: MOOD_COLORS[mood] ?? '#ccc' },
      data: phases.map((p, i) => {
        const raw = counts.get(p.key)?.get(mood) ?? 0
        return totals[i] ? Math.round((raw / totals[i]) * 1000) / 10 : 0
      }),
    })),
  }
})

const hasMoodPhase = computed(() => moodPhase.value.size >= 2)

/** 症状/心情出现频次（合并统计，取前 10） */
const tagOption = computed(() => {
  const counts = new Map<string, number>()
  for (const log of Object.values(data.logs)) {
    for (const t of [...log.moods, ...log.symptoms]) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    if (log.pain && log.pain >= 2) {
      counts.set('痛经明显', (counts.get('痛经明显') ?? 0) + 1)
    }
  }
  const top = [...counts.entries()].sort((a, b) => a[1] - b[1]).slice(-10)
  return {
    grid: { left: 70, right: 24, top: 8, bottom: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: top.map(([t]) => t), axisLabel: { fontSize: 12 } },
    series: [
      {
        type: 'bar',
        data: top.map(([, c]) => c),
        itemStyle: { color: '#f79ab1', borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 16,
      },
    ],
  }
})

/** 头晕 × 屏幕 × 锻炼：近 30 天同轴对比，经期日用浅粉底色标出 */
const HEALTH_DAYS = 30

const healthDays = computed(() =>
  [...Array(HEALTH_DAYS)].map((_, i) =>
    dayjs().subtract(HEALTH_DAYS - 1 - i, 'day').format('YYYY-MM-DD'),
  ),
)

const hasHealthData = computed(() => {
  const days = new Set(healthDays.value)
  return (
    health.screenTime.some((e) => days.has(e.date)) ||
    health.workouts.some((w) => days.has(w.date)) ||
    Object.values(data.logs).some(
      (l) => days.has(l.date) && l.dizziness !== null && l.dizziness !== undefined,
    )
  )
})

const healthOption = computed(() => {
  const days = healthDays.value
  const labels = days.map((d) => dayjs(d).format('M/D'))
  const screen = screenMinutesByDate(health.screenTime)
  const workout = workoutMinutesByDate(health.workouts)
  const toH = (min: number | undefined) =>
    min === undefined ? null : Math.round((min / 60) * 10) / 10

  // 实际经期落在窗口内的部分，用浅粉背景标出
  const today = days[days.length - 1]
  const markData = data.analysis.periods
    .map((p) => {
      const start = p.start_date
      const end = p.end_date ?? today
      if (end < days[0] || start > today) return null
      const si = Math.max(days.indexOf(start < days[0] ? days[0] : start), 0)
      const ei = days.indexOf(end > today ? today : end)
      return [{ xAxis: labels[si] }, { xAxis: labels[ei < 0 ? labels.length - 1 : ei] }]
    })
    .filter(Boolean)

  return {
    grid: { left: 34, right: 34, top: 30, bottom: 24 },
    legend: { top: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11 } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontSize: 9, interval: 4 },
    },
    yAxis: [
      { type: 'value', name: '小时', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      {
        type: 'value',
        min: 0,
        max: 3,
        interval: 1,
        axisLabel: {
          fontSize: 10,
          formatter: (v: number) => ['没晕', '轻微', '明显', '严重'][v] ?? '',
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '屏幕',
        type: 'bar',
        data: days.map((d) => toH(screen.get(d))),
        itemStyle: { color: '#a5b4e0', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 6,
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(238, 90, 125, 0.07)' },
          data: markData,
        },
      },
      {
        name: '锻炼',
        type: 'bar',
        data: days.map((d) => toH(workout.get(d))),
        itemStyle: { color: '#63b98a', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 6,
      },
      {
        name: '头晕',
        type: 'line',
        yAxisIndex: 1,
        data: days.map((d) => data.logs[d]?.dizziness ?? null),
        connectNulls: true,
        smooth: true,
        symbolSize: 5,
        itemStyle: { color: '#ef7d54' },
        lineStyle: { color: '#ef7d54', width: 2 },
      },
    ],
  }
})

const hasCycles = computed(() => data.analysis.cycleLengths.length > 0)
const hasDurations = computed(() => data.analysis.periods.some((p) => p.end_date))
const hasTags = computed(() => Object.keys(data.logs).length > 0)

const summary = computed(() => {
  const a = data.analysis
  if (a.validLengths.length === 0) return null
  return {
    avg: Math.round(a.avgCycle * 10) / 10,
    min: Math.min(...a.validLengths),
    max: Math.max(...a.validLengths),
    periodDays: a.periodDays,
  }
})
</script>

<template>
  <div class="page">
    <div v-if="summary" class="card stats-row">
      <div class="stat">
        <b>{{ summary.avg }}</b>
        <span>平均周期</span>
      </div>
      <div class="stat">
        <b>{{ summary.min }}~{{ summary.max }}</b>
        <span>周期范围</span>
      </div>
      <div class="stat">
        <b>{{ summary.periodDays }}</b>
        <span>经期天数</span>
      </div>
    </div>

    <div class="card">
      <h4 class="chart-title">头晕 × 屏幕 × 锻炼（近 30 天）</h4>
      <p class="chart-sub">柱子是每天的屏幕/锻炼小时数，折线是头晕程度，粉色底是经期。坚持记录，规律会自己浮现</p>
      <v-chart v-if="hasHealthData" class="chart" :option="healthOption" autoresize />
      <p v-else class="empty">在「健康」页记录几天后显示</p>
    </div>

    <div class="card">
      <h4 class="chart-title">周期长度趋势</h4>
      <v-chart v-if="hasCycles" class="chart" :option="cycleOption" autoresize />
      <p v-else class="empty">至少记录两次经期后显示</p>
    </div>

    <div class="card">
      <h4 class="chart-title">每次经期天数</h4>
      <v-chart v-if="hasDurations" class="chart" :option="durationOption" autoresize />
      <p v-else class="empty">标记过经期结束后显示</p>
    </div>

    <div class="card">
      <h4 class="chart-title">心情 × 周期阶段</h4>
      <p class="chart-sub">每个阶段里各种心情的占比，可以看出情绪随周期的变化</p>
      <v-chart v-if="hasMoodPhase" class="chart" :option="moodPhaseOption" autoresize />
      <p v-else class="empty">在不同周期阶段记录心情后显示</p>
    </div>

    <div class="card">
      <h4 class="chart-title">症状 / 心情频次</h4>
      <v-chart v-if="hasTags" class="chart tall" :option="tagOption" autoresize />
      <p v-else class="empty">打卡记录心情或症状后显示</p>
    </div>
  </div>
</template>

<style scoped>
.stats-row {
  display: flex;
  justify-content: space-around;
  text-align: center;
}
.stat b {
  display: block;
  font-size: 20px;
  color: var(--app-primary);
}
.stat span {
  font-size: 12px;
  color: #999;
}
.chart-title {
  margin: 0 0 8px;
  font-size: 15px;
}
.chart-sub {
  margin: -4px 0 8px;
  font-size: 12px;
  color: #b0b0b0;
}
.chart {
  height: 220px;
}
.chart.tall {
  height: 260px;
}
.empty {
  color: #bbb;
  font-size: 13px;
  text-align: center;
  padding: 30px 0;
}
</style>
