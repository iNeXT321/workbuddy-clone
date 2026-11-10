import type { WorkbuddyBridge } from './index'

declare global {
  interface Window {
    workbuddy: WorkbuddyBridge
  }
}

export {}
