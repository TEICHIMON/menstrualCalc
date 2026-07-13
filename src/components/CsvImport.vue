<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Button as VanButton,
  Picker as VanPicker,
  Popup as VanPopup,
  Field as VanField,
  showNotify,
} from 'vant'
import { mapRows, parseCsvFile, type ParsedCsv } from '../lib/csv'
import { useDataStore } from '../stores/data'

const data = useDataStore()

const fileInput = ref<HTMLInputElement>()
const parsed = ref<ParsedCsv | null>(null)
const fileName = ref('')
const startCol = ref<number | null>(null)
const endCol = ref<number | null>(null)
const importing = ref(false)

const pickerTarget = ref<'start' | 'end' | null>(null)
const pickerColumns = computed(() => {
  const cols = (parsed.value?.headers ?? []).map((h, i) => ({
    text: `${h || '(空列名)'}（第 ${i + 1} 列）`,
    value: i,
  }))
  if (pickerTarget.value === 'end') {
    return [{ text: '不导入结束日期', value: -1 }, ...cols]
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
    startCol.value = null
    endCol.value = null
    autoDetect()
  } catch (err) {
    showNotify({ type: 'danger', message: '解析失败：' + (err as Error).message })
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

/** 根据常见列名（含小米导出可能的命名）猜测开始/结束列 */
function autoDetect() {
  const headers = parsed.value?.headers ?? []
  const find = (patterns: RegExp[]) =>
    headers.findIndex((h) => patterns.some((p) => p.test(h)))
  const s = find([/开始/, /start/i, /begin/i, /^date$/i, /日期/])
  const e = find([/结束/, /end/i, /finish/i])
  if (s >= 0) startCol.value = s
  if (e >= 0 && e !== s) endCol.value = e
}

function onPickerConfirm({ selectedValues }: { selectedValues: number[] }) {
  const v = selectedValues[0]
  if (pickerTarget.value === 'start') startCol.value = v
  else endCol.value = v === -1 ? null : v
  pickerTarget.value = null
}

const preview = computed(() => {
  if (!parsed.value || startCol.value === null) return null
  return mapRows(parsed.value.rows, startCol.value, endCol.value)
})

const colName = (i: number | null) =>
  i === null ? '未选择' : (parsed.value?.headers[i] || `第 ${i + 1} 列`)

async function doImport() {
  if (!preview.value || preview.value.ok.length === 0) return
  importing.value = true
  try {
    const count = await data.importPeriods(preview.value.ok)
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
      选择 CSV 文件
    </van-button>

    <template v-else>
      <van-field
        label="文件"
        :model-value="fileName"
        readonly
      />
      <van-field
        label="开始日期列"
        is-link
        readonly
        :model-value="colName(startCol)"
        @click="pickerTarget = 'start'"
      />
      <van-field
        label="结束日期列"
        is-link
        readonly
        :model-value="endCol === null ? '不导入' : colName(endCol)"
        @click="pickerTarget = 'end'"
      />

      <div v-if="preview" class="preview">
        <p class="preview-title">
          识别出 {{ preview.ok.length }} 条记录<template v-if="preview.failed">
            ，{{ preview.failed }} 行日期无法解析已跳过</template
          >，前几条：
        </p>
        <p v-for="r in preview.ok.slice(0, 5)" :key="r.start_date" class="preview-row">
          {{ r.start_date }}<template v-if="r.end_date"> ~ {{ r.end_date }}</template>
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
