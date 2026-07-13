<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Button as VanButton,
  Picker as VanPicker,
  Popup as VanPopup,
  Field as VanField,
  RadioGroup as VanRadioGroup,
  Radio as VanRadio,
  showNotify,
} from 'vant'
import { mapWorkoutRows, parseCsvFile, type ParsedCsv } from '../lib/csv'
import { useHealthStore } from '../stores/health'

const health = useHealthStore()

const fileInput = ref<HTMLInputElement>()
const parsed = ref<ParsedCsv | null>(null)
const fileName = ref('')
const dateCol = ref<number | null>(null)
const durationCol = ref<number | null>(null)
const durationUnit = ref<'seconds' | 'minutes'>('minutes')
const modeCol = ref<number | null>(null)
const hrCol = ref<number | null>(null)
const caloriesCol = ref<number | null>(null)
const importing = ref(false)

type Target = 'date' | 'duration' | 'mode' | 'hr' | 'calories'
const pickerTarget = ref<Target | null>(null)
const OPTIONAL: Target[] = ['mode', 'hr', 'calories']

const pickerColumns = computed(() => {
  const cols = (parsed.value?.headers ?? []).map((h, i) => ({
    text: `${h || '(空列名)'}（第 ${i + 1} 列）`,
    value: i,
  }))
  if (pickerTarget.value && OPTIONAL.includes(pickerTarget.value)) {
    return [{ text: '不导入这一项', value: -1 }, ...cols]
  }
  return cols
})

function pick() {
  fileInput.value?.click()
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    parsed.value = await parseCsvFile(file)
    fileName.value = file.name
    dateCol.value = null
    durationCol.value = null
    modeCol.value = null
    hrCol.value = null
    caloriesCol.value = null
    autoDetect()
  } catch (err) {
    showNotify({ type: 'danger', message: '解析失败：' + (err as Error).message })
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

/** 根据常见列名（含小米导出可能的命名）猜测各列 */
function autoDetect() {
  const headers = parsed.value?.headers ?? []
  const find = (patterns: RegExp[]) =>
    headers.findIndex((h) => patterns.some((p) => p.test(h)))
  const d = find([/开始时间/, /日期/, /start.*time/i, /^date$/i, /^time$/i, /时间/])
  const dur = find([/时长/, /duration/i, /运动时间/])
  const m = find([/类型/, /模式/, /sport/i, /type/i, /category/i])
  const hr = find([/平均心率/, /心率/, /heart/i, /hr/i])
  const cal = find([/卡路里/, /千卡/, /消耗/, /calor/i, /kcal/i])
  if (d >= 0) dateCol.value = d
  if (dur >= 0 && dur !== d) {
    durationCol.value = dur
    // 小米导出的时长普遍是秒
    if (/秒|second|\(s\)/i.test(headers[dur])) durationUnit.value = 'seconds'
  }
  if (m >= 0) modeCol.value = m
  if (hr >= 0) hrCol.value = hr
  if (cal >= 0) caloriesCol.value = cal
}

function onPickerConfirm({ selectedValues }: { selectedValues: number[] }) {
  const v = selectedValues[0]
  const value = v === -1 ? null : v
  if (pickerTarget.value === 'date') dateCol.value = value
  else if (pickerTarget.value === 'duration') durationCol.value = value
  else if (pickerTarget.value === 'mode') modeCol.value = value
  else if (pickerTarget.value === 'hr') hrCol.value = value
  else if (pickerTarget.value === 'calories') caloriesCol.value = value
  pickerTarget.value = null
}

const preview = computed(() => {
  if (!parsed.value || dateCol.value === null || durationCol.value === null) return null
  return mapWorkoutRows(parsed.value.rows, {
    date: dateCol.value,
    duration: durationCol.value,
    durationUnit: durationUnit.value,
    mode: modeCol.value,
    hr: hrCol.value,
    calories: caloriesCol.value,
  })
})

const colName = (i: number | null, emptyText = '未选择') =>
  i === null ? emptyText : (parsed.value?.headers[i] || `第 ${i + 1} 列`)

async function doImport() {
  if (!preview.value || preview.value.ok.length === 0) return
  importing.value = true
  try {
    const count = await health.importWorkouts(preview.value.ok)
    const skipped = preview.value.ok.length - count
    showNotify({
      type: 'success',
      message: `导入 ${count} 条${skipped > 0 ? `，${skipped} 条与已有记录重复已跳过` : ''}`,
    })
    parsed.value = null
  } catch (e) {
    showNotify({ type: 'danger', message: '导入失败：' + (e as Error).message })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div>
    <input
      ref="fileInput"
      type="file"
      accept=".csv,text/csv"
      style="display: none"
      @change="onFile"
    />

    <van-button v-if="!parsed" block plain type="primary" @click="pick">
      选择运动记录 CSV
    </van-button>

    <template v-else>
      <van-field label="文件" :model-value="fileName" readonly />
      <van-field
        label="日期列"
        is-link
        readonly
        :model-value="colName(dateCol)"
        @click="pickerTarget = 'date'"
      />
      <van-field
        label="时长列"
        is-link
        readonly
        :model-value="colName(durationCol)"
        @click="pickerTarget = 'duration'"
      />
      <van-field label="时长单位">
        <template #input>
          <van-radio-group v-model="durationUnit" direction="horizontal">
            <van-radio name="minutes">分钟</van-radio>
            <van-radio name="seconds">秒</van-radio>
          </van-radio-group>
        </template>
      </van-field>
      <van-field
        label="运动类型列"
        is-link
        readonly
        :model-value="colName(modeCol, '不导入')"
        @click="pickerTarget = 'mode'"
      />
      <van-field
        label="平均心率列"
        is-link
        readonly
        :model-value="colName(hrCol, '不导入')"
        @click="pickerTarget = 'hr'"
      />
      <van-field
        label="卡路里列"
        is-link
        readonly
        :model-value="colName(caloriesCol, '不导入')"
        @click="pickerTarget = 'calories'"
      />

      <div v-if="preview" class="preview">
        <p class="preview-title">
          识别出 {{ preview.ok.length }} 条记录<template v-if="preview.failed">
            ，{{ preview.failed }} 行无法解析已跳过</template
          >，前几条：
        </p>
        <p v-for="(r, i) in preview.ok.slice(0, 5)" :key="i" class="preview-row">
          {{ r.date }} {{ r.mode }} {{ r.duration_min }} 分钟<template v-if="r.avg_hr">
            心率 {{ r.avg_hr }}</template
          ><template v-if="r.calories"> {{ r.calories }} 千卡</template>
        </p>
      </div>

      <div class="import-actions">
        <van-button
          type="primary"
          block
          round
          :disabled="!preview || preview.ok.length === 0"
          :loading="importing"
          @click="doImport"
        >
          确认导入
        </van-button>
        <van-button block round plain style="margin-top: 8px" @click="parsed = null">
          取消
        </van-button>
      </div>
    </template>

    <van-popup
      :show="pickerTarget !== null"
      position="bottom"
      round
      @update:show="pickerTarget = null"
    >
      <van-picker
        :columns="pickerColumns"
        @confirm="onPickerConfirm"
        @cancel="pickerTarget = null"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.preview {
  background: #fafafa;
  border-radius: 10px;
  padding: 10px 14px;
  margin: 12px 0;
}
.preview-title {
  font-size: 13px;
  color: #888;
  margin: 0 0 6px;
}
.preview-row {
  font-size: 14px;
  margin: 2px 0;
  color: #444;
}
.import-actions {
  margin-top: 12px;
}
</style>
