<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Button as VanButton,
  CellGroup as VanCellGroup,
  Field as VanField,
  showNotify,
} from 'vant'
import { useAuthStore } from '../stores/auth'
import { isSupabaseConfigured } from '../lib/supabase'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const mode = ref<'signin' | 'signup'>('signin')
const loading = ref(false)

function enterLocal() {
  auth.enterLocalMode()
  router.replace('/')
}

async function submit() {
  if (!email.value || !password.value) {
    showNotify({ type: 'warning', message: '请填写邮箱和密码' })
    return
  }
  loading.value = true
  try {
    if (mode.value === 'signin') {
      await auth.signIn(email.value, password.value)
    } else {
      await auth.signUp(email.value, password.value)
      showNotify({ type: 'success', message: '注册成功，若开启了邮箱确认请先查收邮件' })
    }
    if (auth.user) router.replace('/')
  } catch (e) {
    showNotify({ type: 'danger', message: (e as Error).message })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <h1 class="title">周期记录</h1>
    <p class="subtitle">记录、预测、更了解自己</p>

    <template v-if="!isSupabaseConfigured">
      <div class="card config-hint">
        尚未配置 Supabase（云同步）。可以先使用本地模式，数据只保存在本设备；
        以后配置 <code>.env.local</code> 后再启用云端账号。
      </div>
      <div class="actions">
        <van-button type="primary" block round @click="enterLocal">
          进入本地模式
        </van-button>
      </div>
    </template>

    <van-cell-group v-else inset>
      <van-field v-model="email" label="邮箱" type="email" placeholder="you@example.com" />
      <van-field v-model="password" label="密码" type="password" placeholder="至少 6 位" />
    </van-cell-group>

    <div v-if="isSupabaseConfigured" class="actions">
      <van-button type="primary" block round :loading="loading" @click="submit">
        {{ mode === 'signin' ? '登录' : '注册' }}
      </van-button>
      <van-button plain block round style="margin-top: 10px" @click="mode = mode === 'signin' ? 'signup' : 'signin'">
        {{ mode === 'signin' ? '没有账号？注册' : '已有账号？登录' }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  padding: 64px 20px;
}
.title {
  text-align: center;
  color: var(--app-primary);
  margin: 0 0 4px;
}
.subtitle {
  text-align: center;
  color: #999;
  margin: 0 0 32px;
}
.actions {
  margin: 24px 16px 0;
}
.config-hint {
  color: #b45309;
  background: #fef3c7;
  font-size: 14px;
  line-height: 1.6;
}
</style>
