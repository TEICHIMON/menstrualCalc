<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { markForDate, type CycleAnalysis, type DayMark } from '../lib/cycle'
import type { DailyLog } from '../stores/data'

const props = defineProps<{
  analysis: CycleAnalysis
  logs: Record<string, DailyLog>
}>()
const emit = defineEmits<{ select: [date: string] }>()

const current = ref(dayjs().startOf('month'))
const today = dayjs().format('YYYY-MM-DD')

interface DayCell {
  date: string
  dayOfMonth: number
  inMonth: boolean
  mark: DayMark
  hasLog: boolean
  isToday: boolean
}

const weeks = computed<DayCell[][]>(() => {
  const first = current.value
  // 周一为一周第一天
  const offset = (first.day() + 6) % 7
  let cursor = first.subtract(offset, 'day')
  const result: DayCell[][] = []
  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = cursor.format('YYYY-MM-DD')
      const log = props.logs[date]
      week.push({
        date,
        dayOfMonth: cursor.date(),
        inMonth: cursor.month() === first.month(),
        mark: markForDate(date, props.analysis),
        hasLog: Boolean(
          log && (log.flow || log.pain || log.moods.length || log.symptoms.length || log.note),
        ),
        isToday: date === today,
      })
      cursor = cursor.add(1, 'day')
    }
    result.push(week)
    // 最后一周已完全越出本月时不再渲染
    if (cursor.month() !== first.month() && cursor.date() > 7) break
  }
  return result
})

const title = computed(() => current.value.format('YYYY 年 M 月'))

function prevMonth() {
  current.value = current.value.subtract(1, 'month')
}
function nextMonth() {
  current.value = current.value.add(1, 'month')
}
function backToToday() {
  current.value = dayjs().startOf('month')
}
</script>

<template>
  <div class="calendar card">
    <div class="cal-header">
      <button class="nav" @click="prevMonth">‹</button>
      <span class="cal-title" @click="backToToday">{{ title }}</span>
      <button class="nav" @click="nextMonth">›</button>
    </div>

    <div class="weekdays">
      <span v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w">{{ w }}</span>
    </div>

    <div v-for="(week, wi) in weeks" :key="wi" class="week">
      <button
        v-for="cell in week"
        :key="cell.date"
        class="day"
        :class="[
          cell.mark ? 'mark-' + cell.mark : '',
          { dim: !cell.inMonth, today: cell.isToday },
        ]"
        @click="emit('select', cell.date)"
      >
        <span class="num">{{ cell.dayOfMonth }}</span>
        <span v-if="cell.mark === 'ovulation'" class="ovu">卵</span>
        <span v-else-if="cell.hasLog" class="dot" />
      </button>
    </div>

    <div class="legend">
      <span><i class="lg lg-period" />经期</span>
      <span><i class="lg lg-predicted" />预测经期</span>
      <span><i class="lg lg-fertile" />易孕期</span>
      <span><i class="lg lg-ovulation" />排卵日</span>
    </div>
  </div>
</template>

<style scoped>
.calendar {
  padding: 12px;
}
.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.cal-title {
  font-weight: 600;
  font-size: 16px;
}
.nav {
  border: none;
  background: #f5f5f5;
  border-radius: 8px;
  width: 34px;
  height: 34px;
  font-size: 20px;
  color: #666;
}
.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  color: #bbb;
  font-size: 12px;
  margin-bottom: 4px;
}
.week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.day {
  position: relative;
  border: none;
  background: transparent;
  aspect-ratio: 1;
  border-radius: 50%;
  font-size: 15px;
  color: #333;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 2px;
  padding: 0;
}
.day.dim {
  color: #ccc;
}
.day.today {
  outline: 2px solid var(--app-primary);
  outline-offset: -2px;
}
.mark-period {
  background: var(--app-primary);
  color: #fff !important;
}
.mark-predicted {
  background: transparent;
  border: 1.5px dashed var(--app-primary);
  color: var(--app-primary) !important;
}
.mark-fertile {
  background: #e7f5ec;
  color: #1a7f4b !important;
}
.mark-ovulation {
  background: #1a7f4b;
  color: #fff !important;
}
.ovu {
  font-size: 9px;
  line-height: 1;
}
.dot {
  position: absolute;
  bottom: 4px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--app-primary);
}
.mark-period .dot {
  background: #fff;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-top: 10px;
  font-size: 12px;
  color: #888;
}
.legend .lg {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
}
.lg-period {
  background: var(--app-primary);
}
.lg-predicted {
  border: 1.5px dashed var(--app-primary);
}
.lg-fertile {
  background: #e7f5ec;
  border: 1px solid #1a7f4b;
}
.lg-ovulation {
  background: #1a7f4b;
}
</style>
