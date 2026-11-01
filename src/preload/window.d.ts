import type { OutisApi } from '../shared/api'

declare global {
  interface Window {
    outis: OutisApi
  }
}
