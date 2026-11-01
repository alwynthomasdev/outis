import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Library, Settings } from '@core/types'
import type { AppInfo, BlockedRequest, NerStatus } from '@shared/api'

export const useAppStore = defineStore('app', () => {
  const library = ref<Library | null>(null)
  const settings = ref<Settings | null>(null)
  const ner = ref<NerStatus | null>(null)
  const info = ref<AppInfo | null>(null)
  const blocked = ref<BlockedRequest[]>([])

  async function init(): Promise<void> {
    const api = window.outis
    ;[library.value, settings.value, info.value, blocked.value] = await Promise.all([
      api.getLibrary(),
      api.getSettings(),
      api.appInfo(),
      api.networkLog()
    ])
    api.onNetworkBlocked((b) => blocked.value.push(b))
    ner.value = await api.nerStatus()
    // Load the model in the background so the first text scan is quick.
    if (ner.value.installed && settings.value.text.useNer) {
      api.warmUpNer().then((s) => (ner.value = s))
    }
  }

  async function saveLibrary(lib: Library): Promise<void> {
    library.value = await window.outis.saveLibrary(JSON.parse(JSON.stringify(lib)))
  }

  async function saveSettings(s: Settings): Promise<void> {
    settings.value = await window.outis.saveSettings(JSON.parse(JSON.stringify(s)))
  }

  async function refreshNer(): Promise<void> {
    ner.value = await window.outis.nerStatus()
  }

  return { library, settings, ner, info, blocked, init, saveLibrary, saveSettings, refreshNer }
})
