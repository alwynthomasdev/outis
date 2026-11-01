// Blocks all network traffic from the app. Outis never needs the internet.
import { app, session, type WebContents } from 'electron'

export interface BlockedRequest {
  time: string
  url: string
  source: string
}

const log: BlockedRequest[] = []
const listeners = new Set<(b: BlockedRequest) => void>()

export function recordBlocked(url: string, source: string): void {
  const entry = { time: new Date().toISOString(), url, source }
  log.push(entry)
  if (log.length > 500) log.shift()
  for (const l of listeners) l(entry)
}

export function blockedLog(): BlockedRequest[] {
  return [...log]
}

export function onBlocked(fn: (b: BlockedRequest) => void): void {
  listeners.add(fn)
}

/** Must be called before app 'ready'. Makes DNS fail for everything except localhost. */
export function applyOfflineSwitches(): void {
  app.commandLine.appendSwitch(
    'host-resolver-rules',
    'MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'
  )
  app.commandLine.appendSwitch('disable-background-networking')
  app.commandLine.appendSwitch('disable-component-update')
  app.commandLine.appendSwitch('disable-domain-reliability')
  app.commandLine.appendSwitch('no-pings')
}

const LOCAL_SCHEMES = ['file:', 'devtools:', 'data:', 'blob:', 'chrome:', 'chrome-extension:']

/**
 * Cancel every request that isn't local. In development the renderer is served by the
 * Vite dev server on localhost, so localhost is allowed only then.
 */
export function installRequestGuard(allowLocalhost: boolean): void {
  const ses = session.defaultSession
  ses.setSpellCheckerEnabled(false)
  ses.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false
    try {
      const u = new URL(details.url)
      if (LOCAL_SCHEMES.includes(u.protocol)) allowed = true
      else if (allowLocalhost && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))
        allowed = true
    } catch {
      allowed = false
    }
    if (!allowed) recordBlocked(details.url, 'window')
    callback({ cancel: !allowed })
  })
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
}

/** Stop the window opening new windows or navigating away from the app. */
export function lockWindow(contents: WebContents, appUrlPrefix: string): void {
  contents.setWindowOpenHandler(({ url }) => {
    recordBlocked(url, 'new window')
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appUrlPrefix)) {
      event.preventDefault()
      recordBlocked(url, 'navigation')
    }
  })
}
