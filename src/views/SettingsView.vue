<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Button as VanButton,
  Cell as VanCell,
  CellGroup as VanCellGroup,
  Field as VanField,
  Icon as VanIcon,
  Stepper as VanStepper,
  Switch as VanSwitch,
  showNotify,
} from 'vant'
import { useAuthStore } from '../stores/auth'
import { useDataStore } from '../stores/data'
import { useHealthStore } from '../stores/health'
import { exportPeriodsCsv } from '../lib/csv'
import { requestNotifyPermission } from '../lib/neckReminder'
import CsvImport from '../components/CsvImport.vue'
import WorkoutCsvImport from '../components/WorkoutCsvImport.vue'

const auth = useAuthStore()
const data = useDataStore()
const health = useHealthStore()
const router = useRouter()

const lutealDays = ref(14)
const notifyDaysBefore = ref(2)
const devices = ref<string[]>([])
const neckEnabled = ref(false)
const neckInterval = ref(60)

onMounted(async () => {
  if (!data.loaded) {
    try {
      await data.loadAll()
    } catch (e) {
      showNotify({ type: 'danger', message: '加载数据失败：' + (e as Error).message })
    }
  }
  lutealDays.value = data.settings.luteal_days
  notifyDaysBefore.value = data.settings.notify_days_before
  devices.value = [...data.settings.devices]
  neckEnabled.value = data.settings.neck_reminder_enabled
  neckInterval.value = data.settings.neck_reminder_interval
})

function currentSettings() {
  return {
    luteal_days: lutealDays.value,
    notify_days_before: notifyDaysBefore.value,
    devices: devices.value.map((d) => d.trim()).filter(Boolean),
    neck_reminder_enabled: neckEnabled.value,
    neck_reminder_interval: neckInterval.value,
  }
}

function isDirty() {
  const s = data.settings
  const c = currentSettings()
  return (
    c.luteal_days !== s.luteal_days ||
    c.notify_days_before !== s.notify_days_before ||
    c.neck_reminder_enabled !== s.neck_reminder_enabled ||
    c.neck_reminder_interval !== s.neck_reminder_interval ||
    JSON.stringify(c.devices) !== JSON.stringify(s.devices)
  )
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(
  [lutealDays, notifyDaysBefore, devices, neckEnabled, neckInterval],
  () => {
    // onMounted 里的初始赋值不触发保存
    if (!isDirty()) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await data.saveSettings(currentSettings())
        showNotify({ type: 'success', message: '设置已保存' })
      } catch (e) {
        showNotify({ type: 'danger', message: (e as Error).message })
      }
    }, 600)
  },
  { deep: true },
)

async function onNeckToggle(value: boolean) {
  neckEnabled.value = value
  if (value) {
    const granted = await requestNotifyPermission()
    if (!granted) {
      showNotify({
        type: 'primary',
        message: '没有系统通知权限，提醒将以应用内横幅显示（应用打开时生效）',
      })
    }
  }
}

function addDevice() {
  devices.value.push(`设备${devices.value.length + 1}`)
}

function removeDevice(index: number) {
  devices.value.splice(index, 1)
}

function doExport() {
  if (data.periods.length === 0) {
    showNotify({ type: 'warning', message: '还没有经期记录' })
    return
  }
  exportPeriodsCsv(data.periods)
}

async function signOut() {
  await auth.signOut()
  data.reset()
  health.reset()
  router.replace('/login')
}
</script>

<template>
  <div class="page">
    <h3 class="group-title">周期参数</h3>
    <van-cell-group inset>
      <van-cell title="黄体期天数" label="排卵日 = 预测经期 − 黄体期，一般为 14 天">
        <template #value>
          <van-stepper v-model="lutealDays" :min="10" :max="18" integer />
        </template>
      </van-cell>
      <van-cell title="提前提醒天数" label="打开应用时，临近预测日会显示提醒横幅">
        <template #value>
          <van-stepper v-model="notifyDaysBefore" :min="0" :max="7" integer />
        </template>
      </van-cell>
    </van-cell-group>

    <h3 class="group-title">健康记录</h3>
    <van-cell-group inset>
      <van-cell title="颈椎休息提醒" label="9:00~21:00 之间定时提醒活动颈椎（应用打开时生效）">
        <template #value>
          <van-switch :model-value="neckEnabled" size="22" @update:model-value="onNeckToggle" />
        </template>
      </van-cell>
      <van-cell v-if="neckEnabled" title="提醒间隔（分钟）">
        <template #value>
          <van-stepper v-model="neckInterval" :min="15" :max="240" :step="15" integer />
        </template>
      </van-cell>
    </van-cell-group>

    <h3 class="group-title">屏幕时间设备</h3>
    <van-cell-group inset>
      <van-field
        v-for="(_, i) in devices"
        :key="i"
        v-model="devices[i]"
        placeholder="设备名称"
      >
        <template #right-icon>
          <van-icon
            v-if="devices.length > 1"
            name="delete-o"
            class="device-delete"
            @click="removeDevice(i)"
          />
        </template>
      </van-field>
      <van-cell title="添加设备" is-link icon="plus" @click="addDevice" />
    </van-cell-group>
    <p class="group-hint">改名后，旧名称下已记录的时长仍会计入每日总量</p>

    <h3 class="group-title">数据导入</h3>
    <div class="card">
      <p class="import-hint">
        小米手环用户：在「小米运动健康」App 中依次进入
        <b>我的 → 设置 → 个人信息与权限 → 行使个人信息权利 → 导出个人数据</b>，
        勾选经期数据后提交，压缩包会发送到你的邮箱。解压后把其中的 CSV 文件导入这里，
        选择对应的开始/结束日期列即可。其他 App 导出的 CSV 同样支持。
      </p>
      <CsvImport />
    </div>
    <div class="card">
      <p class="import-hint">
        运动记录同样可以从小米导出的 CSV 批量导入（时长/心率/卡路里/类型），
        选择对应的列即可，与已有记录自动去重。
      </p>
      <WorkoutCsvImport />
    </div>

    <h3 class="group-title">数据备份</h3>
    <van-cell-group inset>
      <van-cell
        title="导出全部经期记录 (CSV)"
        is-link
        :label="`当前共 ${data.periods.length} 条记录`"
        @click="doExport"
      />
    </van-cell-group>

    <h3 class="group-title">账号</h3>
    <van-cell-group inset>
      <van-cell title="当前账号" :value="auth.user?.email ?? ''" />
    </van-cell-group>
    <van-button block round plain type="danger" style="margin-top: 16px" @click="signOut">
      退出登录
    </van-button>
  </div>
</template>

<style scoped>
.group-title {
  font-size: 14px;
  color: #999;
  margin: 20px 8px 8px;
  font-weight: 500;
}
.group-title:first-child {
  margin-top: 0;
}
.import-hint {
  font-size: 13px;
  color: #888;
  line-height: 1.7;
  margin: 0 0 12px;
}
.group-hint {
  font-size: 12px;
  color: #b0b0b0;
  margin: 6px 12px 0;
}
.device-delete {
  color: #bbb;
  font-size: 18px;
}
</style>
