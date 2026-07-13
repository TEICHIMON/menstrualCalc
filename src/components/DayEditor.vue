<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Button as VanButton,
  Field as VanField,
  Popup as VanPopup,
  showNotify,
} from 'vant'
import { useDataStore, type DailyLog } from '../stores/data'

const props = defineProps<{
  show: boolean
  date: string
}>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const data = useDataStore()

const FLOWS = [
  { value: 'light', label: '少' },
  { value: 'medium', label: '中' },
  { value: 'heavy', label: '多' },
] as const
const PAINS = [
  { value: 0, label: '无' },
  { value: 1, label: '轻微' },
  { value: 2, label: '明显' },
  { value: 3, label: '严重' },
]
const DIZZINESS = [
  { value: 0, label: '没晕' },
  { value: 1, label: '轻微' },
  { value: 2, label: '明显' },
  { value: 3, label: '严重' },
]
const MOODS = ['开心', '平静', '烦躁', '低落', '焦虑', '疲惫']
const SYMPTOMS = ['痛经', '腰酸', '头痛', '乳房胀痛', '长痘', '失眠', '食欲差', '恶心']

const flow = ref<DailyLog['flow']>(null)
const pain = ref<number | null>(null)
const dizziness = ref<number | null>(null)
const moods = ref<string[]>([])
const symptoms = ref<string[]>([])
const note = ref('')
const saving = ref(false)

watch(
  () => [props.show, props.date] as const,
  ([show, date]) => {
    if (!show) return
    const log = data.logs[date]
    flow.value = log?.flow ?? null
    pain.value = log?.pain ?? null
    dizziness.value = log?.dizziness ?? null
    moods.value = [...(log?.moods ?? [])]
    symptoms.value = [...(log?.symptoms ?? [])]
    note.value = log?.note ?? ''
  },
  { immediate: true },
)

function toggle(list: string[], item: string) {
  const i = list.indexOf(item)
  if (i >= 0) list.splice(i, 1)
  else list.push(item)
}

async function save() {
  saving.value = true
  try {
    await data.upsertLog({
      date: props.date,
      flow: flow.value,
      pain: pain.value,
      dizziness: dizziness.value,
      moods: moods.value,
      symptoms: symptoms.value,
      note: note.value || null,
    })
    showNotify({ type: 'success', message: '已保存' })
    emit('update:show', false)
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    closeable
    @update:show="emit('update:show', $event)"
  >
    <div class="editor">
      <h3 class="editor-title">{{ date }} 记录</h3>

      <div class="section">
        <div class="section-label">流量</div>
        <div class="chips">
          <button
            v-for="f in FLOWS"
            :key="f.value"
            class="chip"
            :class="{ active: flow === f.value }"
            @click="flow = flow === f.value ? null : f.value"
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-label">痛经程度</div>
        <div class="chips">
          <button
            v-for="p in PAINS"
            :key="p.value"
            class="chip"
            :class="{ active: pain === p.value }"
            @click="pain = pain === p.value ? null : p.value"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-label">头晕程度</div>
        <div class="chips">
          <button
            v-for="d in DIZZINESS"
            :key="d.value"
            class="chip"
            :class="{ active: dizziness === d.value }"
            @click="dizziness = dizziness === d.value ? null : d.value"
          >
            {{ d.label }}
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-label">心情</div>
        <div class="chips">
          <button
            v-for="m in MOODS"
            :key="m"
            class="chip"
            :class="{ active: moods.includes(m) }"
            @click="toggle(moods, m)"
          >
            {{ m }}
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-label">症状</div>
        <div class="chips">
          <button
            v-for="s in SYMPTOMS"
            :key="s"
            class="chip"
            :class="{ active: symptoms.includes(s) }"
            @click="toggle(symptoms, s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <van-field
        v-model="note"
        label="备注"
        type="textarea"
        rows="2"
        autosize
        placeholder="其他想记的…"
      />

      <van-button
        type="primary"
        block
        round
        :loading="saving"
        style="margin-top: 16px"
        @click="save"
      >
        保存
      </van-button>
    </div>
  </van-popup>
</template>

<style scoped>
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
</style>
