<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue'
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NTooltip,
  darkTheme,
  useOsTheme,
  type GlobalThemeOverrides
} from 'naive-ui'
import { useAppStore } from './stores/app'

const app = useAppStore()
const os = useOsTheme()
const dark = computed(() => os.value === 'dark')
const theme = computed(() => (dark.value ? darkTheme : null))

watchEffect(() =>
  document.documentElement.setAttribute('data-theme', dark.value ? 'dark' : 'light')
)

const overrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: dark.value ? '#5fb8a3' : '#2f6f62',
    primaryColorHover: dark.value ? '#74c8b4' : '#3a8577',
    primaryColorPressed: dark.value ? '#4a9b88' : '#245a4f',
    primaryColorSuppl: dark.value ? '#5fb8a3' : '#2f6f62',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    fontFamilyMono: 'ui-monospace, "Cascadia Code", Consolas, monospace'
  }
}))

const nav = [
  { to: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
  { to: '/data', label: 'Files', icon: 'M4 4h10l6 6v10H4zM14 4v6h6' },
  { to: '/text', label: 'Text', icon: 'M4 6h16M4 10h16M4 14h10M4 18h12' },
  { to: '/library', label: 'PII library', icon: 'M4 5h5v14H4zM10 5h5v14h-5zM16 6l4 1-3 13-4-1z' },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4'
  }
]

const nerLabel = computed(() => {
  const n = app.ner
  if (!n) return 'ML: checking…'
  if (!n.installed) return 'ML: not installed (rules only)'
  if (n.error) return 'ML: error (rules only)'
  return n.loaded ? 'ML: ready' : 'ML: loading…'
})

onMounted(() => app.init())
</script>

<template>
  <n-config-provider :theme="theme" :theme-overrides="overrides">
    <n-message-provider>
      <n-dialog-provider>
        <div class="shell">
          <aside class="sidebar">
            <div class="brand">
              <span class="logo">◐</span>
              <span>Outis</span>
            </div>
            <nav>
              <router-link
                v-for="item in nav"
                :key="item.to"
                :to="item.to"
                class="nav-item"
                active-class=""
                exact-active-class="active"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                >
                  <path :d="item.icon" />
                </svg>
                {{ item.label }}
              </router-link>
            </nav>
          </aside>
          <main class="content">
            <router-view v-slot="{ Component }">
              <keep-alive>
                <component :is="Component" />
              </keep-alive>
            </router-view>
          </main>
          <footer class="status">
            <n-tooltip>
              <template #trigger>
                <span class="offline" :class="{ warn: app.blocked.length > 0 }">
                  ● Offline{{
                    app.blocked.length ? ` · ${app.blocked.length} request(s) blocked` : ''
                  }}
                </span>
              </template>
              All network access is blocked. Your data never leaves this computer. See Settings →
              Network guard.
            </n-tooltip>
            <span class="muted">{{ nerLabel }}</span>
            <span class="spacer" />
            <span class="muted">v{{ app.info?.version }}</span>
          </footer>
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 200px 1fr;
  grid-template-rows: 1fr 28px;
  height: 100vh;
}
.sidebar {
  grid-row: 1 / 3;
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 16px 10px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 18px;
  padding: 0 8px 18px;
}
.logo {
  color: var(--accent);
  font-size: 22px;
}
nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--text);
  text-decoration: none;
}
.nav-item:hover {
  background: var(--bg);
}
.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.content {
  overflow: hidden;
  min-width: 0;
}
.status {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 14px;
  border-top: 1px solid var(--border);
  background: var(--panel);
  font-size: 12px;
}
.offline {
  color: #2e8b57;
  cursor: default;
}
.offline.warn {
  color: #c27c0e;
}
.spacer {
  flex: 1;
}
</style>
