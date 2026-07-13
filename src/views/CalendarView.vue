<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import {
  ActionSheet as VanActionSheet,
  showConfirmDialog,
  showNotify,
} from 'vant'
import { useDataStore } from '../stores/data'
import MonthCalendar from '../components/MonthCalendar.vue'
import DayEditor from '../components/DayEditor.vue'

const data = useDataStore()

const selectedDate = ref('')
const showSheet = ref(false)
const showEditor = ref(false)

onMounted(async () => {
  if (!data.loaded) {
    try {
      await data.loadAll()
    } catch (e) {
      showNotify({ type: 'danger', message: '加载数据失败：' + (e as Error).message })
    }
  }
})

/** 选中日所在的实际经期记录（若有） */
const periodOfSelected = computed(() => {
  if (!selectedDate.value) return null
  const d = dayjs(selectedDate.value)
  return (
    data.analysis.periods.find((p) => {
      const start = dayjs(p.start_date)
      const end = p.end_date
        ? dayjs(p.end_date)
        : start.add(data.analysis.periodDays - 1, 'day')
      return !d.isBefore(start) && !d.isAfter(end)
    }) ?? null
  )
})

/** 选中日之前最近的一段"进行中"经期（用于补记结束日） */
const ongoingBeforeSelected = computed(() => {
  if (!selectedDate.value) return null
  const last = data.analysis.periods[data.analysis.periods.length - 1]
  if (!last || last.end_date) return null
  const start = dayjs(last.start_date)
  const d = dayjs(selectedDate.value)
  return !d.isBefore(start) && d.diff(start, 'day') < 15 ? last : null
})

const actions = computed(() => {
  const list: { name: string; callback: () => void }[] = [
    { name: '打卡记录（心情 / 症状）', callback: openEditor },
  ]
  const p = periodOfSelected.value
  if (p) {
    list.push({ name: '删除这段经期记录', callback: removePeriod })
  } else {
    list.push({ name: '将这天记为经期开始', callback: markStart })
    if (ongoingBeforeSelected.value) {
      list.push({ name: '将这天记为经期结束', callback: markEnd })
    }
  }
  return list
})

function onSelect(date: string) {
  selectedDate.value = date
  showSheet.value = true
}

function openEditor() {
  showSheet.value = false
  showEditor.value = true
}

async function markStart() {
  showSheet.value = false
  try {
    await data.startPeriod(selectedDate.value)
    showNotify({ type: 'success', message: `已将 ${selectedDate.value} 记为经期开始` })
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  }
}

async function markEnd() {
  showSheet.value = false
  const ongoing = ongoingBeforeSelected.value
  if (!ongoing?.id) return
  try {
    await data.endPeriod(ongoing.id, selectedDate.value)
    showNotify({ type: 'success', message: `已将 ${selectedDate.value} 记为经期结束` })
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  }
}

async function removePeriod() {
  showSheet.value = false
  const p = periodOfSelected.value
  if (!p?.id) return
  try {
    await showConfirmDialog({
      title: '删除经期记录',
      message: `删除 ${p.start_date} 开始的这段经期记录？`,
    })
    await data.deletePeriod(p.id)
    showNotify({ type: 'success', message: '已删除' })
  } catch {
    /* 用户取消 */
  }
}
</script>

<template>
  <div class="page">
    <MonthCalendar :analysis="data.analysis" :logs="data.logs" @select="onSelect" />

    <div v-if="data.analysis.insufficientData" class="card hint-card">
      记录还不够多，预测标记按默认 28 天周期估算，仅供参考
    </div>

    <van-action-sheet
      v-model:show="showSheet"
      :title="selectedDate"
      :actions="actions"
      cancel-text="取消"
      close-on-click-action
    />
    <DayEditor v-model:show="showEditor" :date="selectedDate" />
  </div>
</template>

<style scoped>
.hint-card {
  font-size: 13px;
  color: #b0b0b0;
}
</style>
