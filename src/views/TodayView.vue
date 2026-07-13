<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import {
  Button as VanButton,
  Dialog as VanDialog,
  NoticeBar as VanNoticeBar,
  showNotify,
} from 'vant'
import { useDataStore } from '../stores/data'
import DayEditor from '../components/DayEditor.vue'
import type { Phase } from '../lib/cycle'

const data = useDataStore()
const today = dayjs().format('YYYY-MM-DD')

const showEditor = ref(false)
const confirmStart = ref(false)
const confirmEnd = ref(false)
const busy = ref(false)

onMounted(async () => {
  if (!data.loaded) {
    try {
      await data.loadAll()
    } catch (e) {
      showNotify({ type: 'danger', message: '加载数据失败：' + (e as Error).message })
    }
  }
})

const PHASE_LABEL: Record<Phase, string> = {
  period: '经期中',
  follicular: '卵泡期',
  fertile: '易孕期',
  luteal: '黄体期',
  overdue: '经期推迟',
  unknown: '暂无数据',
}
const PHASE_DESC: Record<Phase, string> = {
  period: '注意休息，多喝热水',
  follicular: '身体状态上升期',
  fertile: '受孕概率较高的日子',
  luteal: '可能会有经前不适',
  overdue: '晚几天很常见，先别担心',
  unknown: '记录第一次经期后开始预测',
}

const status = computed(() => data.status)
const analysis = computed(() => data.analysis)

const nextText = computed(() => {
  const s = status.value
  if (!s.nextPrediction || s.daysUntilNext === null) return null
  if (s.daysUntilNext > 0) return `${s.daysUntilNext} 天后`
  if (s.daysUntilNext === 0) return '预计就是今天'
  return `已推迟 ${-s.daysUntilNext} 天`
})

const upcomingBanner = computed(() => {
  const s = status.value
  const d = s.daysUntilNext
  if (d === null || s.inPeriod) return null
  if (d >= 0 && d <= data.settings.notify_days_before) {
    return d === 0 ? '预计今天月经来潮，记得带好用品' : `预计 ${d} 天后月经来潮，提前做好准备`
  }
  return null
})

async function startPeriod() {
  busy.value = true
  try {
    await data.startPeriod(today)
    showNotify({ type: 'success', message: '已记录经期开始' })
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  } finally {
    busy.value = false
    confirmStart.value = false
  }
}

async function endPeriod() {
  const ongoing = status.value.ongoingPeriod
  if (!ongoing?.id) return
  busy.value = true
  try {
    await data.endPeriod(ongoing.id, today)
    showNotify({ type: 'success', message: '已记录经期结束' })
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  } finally {
    busy.value = false
    confirmEnd.value = false
  }
}
</script>

<template>
  <div class="page">
    <van-notice-bar
      v-if="upcomingBanner"
      left-icon="bell"
      :text="upcomingBanner"
      style="border-radius: 10px; margin-bottom: 12px"
    />

    <div class="card hero" :class="'phase-' + status.phase">
      <div class="hero-day" v-if="status.cycleDay !== null">
        周期第 <b>{{ status.cycleDay }}</b> 天
      </div>
      <div class="hero-phase">{{ PHASE_LABEL[status.phase] }}</div>
      <div class="hero-desc">{{ PHASE_DESC[status.phase] }}</div>
    </div>

    <div class="card" v-if="status.nextPrediction">
      <div class="row">
        <span class="row-label">下次月经</span>
        <span class="row-value">
          {{ status.nextPrediction.periodStart }}
          <em v-if="nextText">（{{ nextText }}）</em>
        </span>
      </div>
      <div class="row">
        <span class="row-label">浮动范围</span>
        <span class="row-value">
          {{ status.nextPrediction.windowStart }} ~ {{ status.nextPrediction.windowEnd }}
        </span>
      </div>
      <div class="row">
        <span class="row-label">预计排卵</span>
        <span class="row-value">{{ status.nextPrediction.ovulation }}</span>
      </div>
      <div class="row">
        <span class="row-label">易孕期</span>
        <span class="row-value">
          {{ status.nextPrediction.fertile.start }} ~ {{ status.nextPrediction.fertile.end }}
        </span>
      </div>
      <p v-if="analysis.insufficientData" class="hint">
        记录还不够多，目前按 28 天周期估算，仅供参考
      </p>
    </div>

    <div
      v-for="(w, i) in analysis.warnings"
      :key="i"
      class="card warning"
    >
      {{ w }}
    </div>

    <div class="actions">
      <van-button
        v-if="status.ongoingPeriod"
        type="primary"
        block
        round
        :loading="busy"
        @click="confirmEnd = true"
      >
        经期结束
      </van-button>
      <van-button
        v-else
        type="primary"
        block
        round
        :loading="busy"
        @click="confirmStart = true"
      >
        经期开始
      </van-button>
      <van-button block round plain style="margin-top: 10px" @click="showEditor = true">
        今日打卡（心情 / 症状）
      </van-button>
    </div>

    <van-dialog
      v-model:show="confirmStart"
      title="记录经期开始"
      show-cancel-button
      :message="`将 ${today} 记为经期第一天？`"
      @confirm="startPeriod"
    />
    <van-dialog
      v-model:show="confirmEnd"
      title="记录经期结束"
      show-cancel-button
      :message="`将 ${today} 记为经期最后一天？`"
      @confirm="endPeriod"
    />

    <DayEditor v-model:show="showEditor" :date="today" />
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 32px 16px;
  background: linear-gradient(160deg, #ffe3ea, #fff);
}
.hero-day {
  color: #888;
  font-size: 15px;
}
.hero-day b {
  color: var(--app-primary);
  font-size: 28px;
  margin: 0 2px;
}
.hero-phase {
  font-size: 26px;
  font-weight: 600;
  color: var(--app-primary);
  margin: 8px 0 4px;
}
.hero-desc {
  color: #999;
  font-size: 14px;
}
.row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 15px;
}
.row-label {
  color: #999;
}
.row-value em {
  font-style: normal;
  color: var(--app-primary);
}
.hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: #b0b0b0;
}
.warning {
  background: #fff7e6;
  color: #ad6800;
  font-size: 14px;
}
.actions {
  margin-top: 20px;
}
</style>
