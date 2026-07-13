<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import {
  Button as VanButton,
  Field as VanField,
  Icon as VanIcon,
  Popup as VanPopup,
  Slider as VanSlider,
  Stepper as VanStepper,
  showNotify,
} from 'vant'
import { useDataStore } from '../stores/data'
import { useHealthStore } from '../stores/health'
import { DIZZINESS_LEVELS, WORKOUT_MODES, recordStreak, weeklyReport } from '../lib/health'

const data = useDataStore()
const health = useHealthStore()

const today = dayjs().format('YYYY-MM-DD')
const date = ref(today)

onMounted(async () => {
  try {
    if (!data.loaded) await data.loadAll()
    if (!health.loaded) await health.loadAll()
  } catch (e) {
    showNotify({ type: 'danger', message: '加载数据失败：' + (e as Error).message })
  }
})

const dateLabel = computed(() => {
  if (date.value === today) return '今天'
  if (date.value === dayjs(today).subtract(1, 'day').format('YYYY-MM-DD')) return '昨天'
  return dayjs(date.value).format('M月D日')
})
const canForward = computed(() => date.value < today)
function shiftDate(days: number) {
  const next = dayjs(date.value).add(days, 'day').format('YYYY-MM-DD')
  if (next > today) return
  date.value = next
}

/* ---------- 头晕 ---------- */

const dizziness = computed(() => data.logs[date.value]?.dizziness ?? null)

async function setDizziness(level: number) {
  const log = data.logs[date.value]
  const next = dizziness.value === level ? null : level
  try {
    await data.upsertLog({
      date: date.value,
      flow: log?.flow ?? null,
      pain: log?.pain ?? null,
      dizziness: next,
      moods: log?.moods ?? [],
      symptoms: log?.symptoms ?? [],
      note: log?.note ?? null,
    })
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  }
}

/* ---------- 屏幕时间 ---------- */

const MAX_SCREEN_MIN = 16 * 60
const screenDraft = reactive<Record<string, number>>({})
let initializingScreen = false

function loadScreenDraft() {
  initializingScreen = true
  const entries = health.screenTime.filter((e) => e.date === date.value)
  for (const device of data.settings.devices) {
    screenDraft[device] = entries.find((e) => e.device === device)?.minutes ?? 0
  }
  // 设备列表里已删除的设备不再展示
  for (const k of Object.keys(screenDraft)) {
    if (!data.settings.devices.includes(k)) delete screenDraft[k]
  }
  initializingScreen = false
}

watch(
  [date, () => health.loaded, () => data.settings.devices],
  () => loadScreenDraft(),
  { immediate: true, deep: true },
)

let screenTimer: ReturnType<typeof setTimeout> | undefined
let pendingScreenSave: (() => Promise<void>) | null = null

watch(
  () => ({ ...screenDraft }),
  () => {
    if (initializingScreen) return
    clearTimeout(screenTimer)
    const forDate = date.value
    const entries = data.settings.devices.map((device) => ({
      device,
      minutes: screenDraft[device] ?? 0,
    }))
    pendingScreenSave = async () => {
      pendingScreenSave = null
      try {
        await health.saveScreenTime(forDate, entries)
      } catch (e) {
        showNotify({ type: 'danger', message: (e as Error).message })
      }
    }
    screenTimer = setTimeout(() => pendingScreenSave?.(), 800)
  },
  // 同步触发才能让 initializingScreen 标志生效（异步回调执行时标志已复位）
  { flush: 'sync' },
)

// 切换日期或离开页面时，把还没到点的防抖保存立即落盘，避免丢数据
function flushScreenSave() {
  clearTimeout(screenTimer)
  void pendingScreenSave?.()
}
watch(date, flushScreenSave)
onBeforeUnmount(flushScreenSave)

const screenTotal = computed(() =>
  Object.values(screenDraft).reduce((a, b) => a + b, 0),
)

function fmtMin(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} 分钟`
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`
}

/* ---------- 锻炼 ---------- */

const dayWorkouts = computed(() =>
  health.workouts.filter((w) => w.date === date.value),
)

const showWorkoutEditor = ref(false)
const wMode = ref(WORKOUT_MODES[0])
const wDuration = ref(30)
const wHr = ref('')
const wCalories = ref('')
const savingWorkout = ref(false)

function openWorkoutEditor() {
  wMode.value = WORKOUT_MODES[0]
  wDuration.value = 30
  wHr.value = ''
  wCalories.value = ''
  showWorkoutEditor.value = true
}

async function saveWorkout() {
  savingWorkout.value = true
  try {
    await health.addWorkout({
      date: date.value,
      mode: wMode.value,
      duration_min: wDuration.value,
      avg_hr: wHr.value ? Number(wHr.value) : null,
      calories: wCalories.value ? Number(wCalories.value) : null,
    })
    showNotify({ type: 'success', message: '已记录，动起来的每一分钟都算数' })
    showWorkoutEditor.value = false
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  } finally {
    savingWorkout.value = false
  }
}

async function removeWorkout(id?: string) {
  if (!id) return
  try {
    await health.deleteWorkout(id)
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  }
}

/* ---------- 周报 + 连续打卡 ---------- */

const weekStart = computed(() => {
  const d = dayjs(today)
  return d.subtract((d.day() + 6) % 7, 'day').format('YYYY-MM-DD')
})

const report = computed(() => {
  const dizzy = new Map<string, number>()
  for (const log of Object.values(data.logs)) {
    if (log.dizziness !== null && log.dizziness !== undefined) dizzy.set(log.date, log.dizziness)
  }
  return weeklyReport({
    weekStart: weekStart.value,
    screen: health.screenTime,
    workouts: health.workouts,
    dizziness: dizzy,
  })
})

const streak = computed(() => {
  const dates = new Set<string>()
  for (const e of health.screenTime) dates.add(e.date)
  for (const w of health.workouts) dates.add(w.date)
  for (const log of Object.values(data.logs)) {
    if (log.dizziness !== null && log.dizziness !== undefined) dates.add(log.date)
  }
  return recordStreak(dates, today)
})

/* ---------- 颈椎放松 ---------- */

const showNeckGuide = ref(false)
const NECK_MOVES = [
  { name: '缓慢点头', desc: '下巴慢慢靠近胸口停 5 秒，再缓缓抬头看天花板停 5 秒，重复 5 次' },
  { name: '左右转头', desc: '头缓慢转向左侧停 5 秒，回正后转向右侧，各 5 次，幅度以不痛为准' },
  { name: '侧向拉伸', desc: '右手轻扶头部向右侧倾，感到左侧脖颈轻微拉伸，停 10 秒，换边' },
  { name: '收下巴', desc: '平视前方，水平向后收下巴（做出双下巴），停 5 秒，重复 10 次——对曲度变直最有帮助' },
  { name: '肩胛后收', desc: '双肩向后向下沉，两侧肩胛骨向中间夹紧，停 5 秒，重复 10 次' },
]
</script>

<template>
  <div class="page">
    <!-- 日期切换 -->
    <div class="card date-nav">
      <van-icon name="arrow-left" class="date-arrow" @click="shiftDate(-1)" />
      <div class="date-label">
        <b>{{ dateLabel }}</b>
        <span>{{ date }}</span>
      </div>
      <van-icon
        name="arrow"
        class="date-arrow"
        :class="{ disabled: !canForward }"
        @click="shiftDate(1)"
      />
    </div>

    <!-- 本周小结 -->
    <div class="card week-card">
      <div class="week-head">
        <h4 class="card-title">本周小结</h4>
        <span v-if="streak >= 2" class="streak">🔥 连续记录 {{ streak }} 天</span>
      </div>
      <template v-if="report.length">
        <p v-for="(line, i) in report" :key="i" class="week-line">{{ line }}</p>
      </template>
      <p v-else class="week-line muted">记录几天后，这里会出现你的每周小结</p>
    </div>

    <!-- 头晕 -->
    <div class="card">
      <h4 class="card-title">{{ dateLabel }}头晕吗？</h4>
      <div class="chips">
        <button
          v-for="d in DIZZINESS_LEVELS"
          :key="d.value"
          class="chip"
          :class="{ active: dizziness === d.value }"
          @click="setDizziness(d.value)"
        >
          {{ d.label }}
        </button>
      </div>
      <p class="card-hint">头晕不是身体出了大问题的信号，把它记下来，慢慢观察它和屏幕、锻炼的关系</p>
    </div>

    <!-- 屏幕时间 -->
    <div class="card">
      <div class="week-head">
        <h4 class="card-title">屏幕时间</h4>
        <span v-if="screenTotal > 0" class="screen-total">共 {{ fmtMin(screenTotal) }}</span>
      </div>
      <div v-for="device in data.settings.devices" :key="device" class="device-row">
        <div class="device-head">
          <span class="device-name">{{ device }}</span>
          <span class="device-value">{{ fmtMin(screenDraft[device] ?? 0) }}</span>
        </div>
        <van-slider
          v-model="screenDraft[device]"
          :min="0"
          :max="MAX_SCREEN_MIN"
          :step="15"
          bar-height="6px"
        />
      </div>
      <p class="card-hint">照着手机「屏幕使用时间」抄一下就行，改动会自动保存</p>
    </div>

    <!-- 锻炼 -->
    <div class="card">
      <h4 class="card-title">锻炼</h4>
      <div v-if="dayWorkouts.length === 0" class="empty-line">
        {{ date === today ? '今天还没有锻炼记录' : '这一天没有锻炼记录' }}
      </div>
      <div v-for="w in dayWorkouts" :key="w.id" class="workout-row">
        <div class="workout-main">
          <b>{{ w.mode }}</b>
          <span>{{ w.duration_min }} 分钟</span>
          <span v-if="w.avg_hr">❤️ {{ w.avg_hr }}</span>
          <span v-if="w.calories">🔥 {{ w.calories }} 千卡</span>
        </div>
        <van-icon name="cross" class="workout-del" @click="removeWorkout(w.id)" />
      </div>
      <van-button block round plain type="primary" size="small" @click="openWorkoutEditor">
        添加锻炼
      </van-button>
    </div>

    <!-- 颈椎放松 -->
    <div class="card">
      <h4 class="card-title">颈椎放松</h4>
      <p class="card-hint" style="margin-top: 0">
        每天几分钟的放松练习，对改善颈椎曲度和头晕都有帮助。可以在「设置」里打开定时提醒。
      </p>
      <van-button block round plain size="small" @click="showNeckGuide = true">
        查看放松动作（约 3 分钟）
      </van-button>
    </div>

    <!-- 添加锻炼弹层 -->
    <van-popup v-model:show="showWorkoutEditor" position="bottom" round closeable>
      <div class="editor">
        <h3 class="editor-title">添加锻炼</h3>
        <div class="section">
          <div class="section-label">运动模式</div>
          <div class="chips">
            <button
              v-for="m in WORKOUT_MODES"
              :key="m"
              class="chip"
              :class="{ active: wMode === m }"
              @click="wMode = m"
            >
              {{ m }}
            </button>
          </div>
        </div>
        <div class="section stepper-row">
          <div class="section-label">时长（分钟）</div>
          <van-stepper v-model="wDuration" :min="1" :max="600" :step="5" integer />
        </div>
        <van-field
          v-model="wHr"
          label="平均心率"
          type="digit"
          placeholder="选填，如 120"
        />
        <van-field
          v-model="wCalories"
          label="消耗（千卡）"
          type="digit"
          placeholder="选填，如 200"
        />
        <van-button
          type="primary"
          block
          round
          :loading="savingWorkout"
          style="margin-top: 16px"
          @click="saveWorkout"
        >
          保存
        </van-button>
      </div>
    </van-popup>

    <!-- 颈椎放松动作弹层 -->
    <van-popup v-model:show="showNeckGuide" position="bottom" round closeable>
      <div class="editor">
        <h3 class="editor-title">颈椎放松动作</h3>
        <p class="card-hint" style="margin-top: -6px">
          所有动作都要慢，幅度以完全不痛为准，出现明显不适就停下
        </p>
        <div v-for="(m, i) in NECK_MOVES" :key="m.name" class="neck-move">
          <b>{{ i + 1 }}. {{ m.name }}</b>
          <p>{{ m.desc }}</p>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.date-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}
.date-arrow {
  font-size: 18px;
  color: var(--app-primary);
  padding: 6px;
}
.date-arrow.disabled {
  color: #ddd;
}
.date-label {
  text-align: center;
}
.date-label b {
  display: block;
  font-size: 17px;
}
.date-label span {
  font-size: 12px;
  color: #aaa;
}
.card-title {
  margin: 0 0 10px;
  font-size: 15px;
}
.week-card {
  background: linear-gradient(160deg, #eef7f1, #fff);
}
.week-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.streak {
  font-size: 12px;
  color: #d97706;
}
.week-line {
  margin: 4px 0;
  font-size: 14px;
  color: #4a6a56;
  line-height: 1.6;
}
.week-line.muted {
  color: #9db3a6;
}
.card-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #b0b0b0;
  line-height: 1.6;
}
.screen-total {
  font-size: 13px;
  color: var(--app-primary);
  font-weight: 600;
}
.device-row {
  margin-bottom: 14px;
}
.device-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 8px;
}
.device-name {
  color: #666;
}
.device-value {
  color: #999;
}
.empty-line {
  font-size: 13px;
  color: #bbb;
  margin-bottom: 10px;
}
.workout-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafafa;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.workout-main {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 14px;
  flex-wrap: wrap;
}
.workout-main span {
  color: #888;
  font-size: 13px;
}
.workout-del {
  color: #ccc;
  padding: 4px;
}
.editor {
  padding: 20px 16px 28px;
}
.editor-title {
  margin: 0 0 12px;
  text-align: center;
}
.section {
  margin-bottom: 14px;
}
.section-label {
  font-size: 13px;
  color: #999;
  margin-bottom: 8px;
}
.stepper-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stepper-row .section-label {
  margin-bottom: 0;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  border: 1px solid #eee;
  background: #fafafa;
  border-radius: 16px;
  padding: 6px 14px;
  font-size: 14px;
  color: #555;
}
.chip.active {
  background: var(--app-primary-soft);
  border-color: var(--app-primary);
  color: var(--app-primary);
}
.neck-move {
  margin-bottom: 12px;
}
.neck-move b {
  font-size: 14px;
}
.neck-move p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #777;
  line-height: 1.6;
}
</style>
