<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Tabbar as VanTabbar, TabbarItem as VanTabbarItem } from 'vant'
import { useDataStore } from './stores/data'
import { setupNeckReminder } from './lib/neckReminder'

const route = useRoute()
const showTabbar = computed(() => route.name !== 'login')

const data = useDataStore()
onMounted(() => {
  setupNeckReminder(() => ({
    enabled: data.settings.neck_reminder_enabled,
    interval: data.settings.neck_reminder_interval,
  }))
})
</script>

<template>
  <router-view />
  <van-tabbar v-if="showTabbar" route fixed placeholder>
    <van-tabbar-item replace to="/" icon="wap-home-o">今天</van-tabbar-item>
    <van-tabbar-item replace to="/calendar" icon="calendar-o">日历</van-tabbar-item>
    <van-tabbar-item replace to="/health" icon="like-o">健康</van-tabbar-item>
    <van-tabbar-item replace to="/stats" icon="chart-trending-o">统计</van-tabbar-item>
    <van-tabbar-item replace to="/settings" icon="setting-o">设置</van-tabbar-item>
  </van-tabbar>
</template>
