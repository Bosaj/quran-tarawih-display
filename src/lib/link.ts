import type { RiwayaId } from './corpus.ts'
import type { TrackerStatus } from './tracker.ts'

export type TranslationId = 'none' | 'fr' | 'en'

/** Everything a display screen needs. The technician's page is the only one that writes it. */
export interface ScreenState {
  riwaya: RiwayaId
  /** Index of the ayah in the corpus, or -1 before the first lock. */
  ayah: number
  /** How many on-screen tokens of that ayah have been reached. */
  token: number
  status: TrackerStatus | 'idle' | 'frozen'
  blank: boolean
  translation: TranslationId
  showNext: boolean
  mosque: string
}

export const INITIAL_SCREEN: ScreenState = { riwaya: 'warsh', ayah: -1, token: 0, status: 'idle', blank: false, translation: 'none', showNext: false, mosque: '' }

export type Command = 'prev' | 'next' | 'blank' | 'freeze'

export type LinkMessage = { type: 'state'; state: ScreenState } | { type: 'hello' } | { type: 'command'; command: Command }

export interface Link {
  send(message: LinkMessage): void
  close(): void
}

/**
 * Connects the technician's page, the display windows and phone remotes. Windows of one browser talk
 * over a BroadcastChannel, which needs no server. Served by `npm run lan`, a WebSocket relay also
 * reaches other devices on the mosque's network.
 */
export function openLink(onMessage: (m: LinkMessage) => void): Link {
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('tarawih')
  if (channel) channel.onmessage = (e) => onMessage(e.data as LinkMessage)
  let socket: WebSocket | null = null
  let closed = false
  const connect = () => {
    if (closed) return
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/link`)
    ws.onmessage = (e) => onMessage(JSON.parse(String(e.data)) as LinkMessage)
    ws.onopen = () => {
      socket = ws
      onMessage({ type: 'hello' })
      ws.send(JSON.stringify({ type: 'hello' } satisfies LinkMessage))
    }
    ws.onclose = () => {
      socket = null
      setTimeout(connect, 2000)
    }
  }
  fetch('/lan.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { lan?: boolean } | null) => {
      if (j?.lan) connect()
    })
    .catch(() => {})
  return {
    send(message) {
      channel?.postMessage(message)
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    },
    close() {
      closed = true
      channel?.close()
      socket?.close()
    },
  }
}
