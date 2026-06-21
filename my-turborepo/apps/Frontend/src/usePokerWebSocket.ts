import { useCallback, useEffect, useRef, useState } from 'react'
import { getStoredToken } from './authApi'
import { fetchPokerRoom, pokerWsUrl } from './pokerApi'

type WsHandler = (data: { type?: string; room?: unknown; message?: string }) => void

/**
 * Stable poker WebSocket — avoids Strict Mode closing CONNECTING sockets and
 * re-subscribes without tearing down on callback identity changes.
 */
export function usePokerWebSocket(userId: number | undefined, onEvent: WsHandler) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<string[]>([])
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const flushPending = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    while (pendingRef.current.length) ws.send(pendingRef.current.shift()!)
  }, [])

  const send = useCallback((msg: Record<string, unknown>): boolean => {
    const payload = JSON.stringify(msg)
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(payload)
      return true
    }
    pendingRef.current.push(payload)
    if (ws?.readyState === WebSocket.CONNECTING) return true
    return false
  }, [])

  useEffect(() => {
    if (!userId) {
      pendingRef.current = []
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      const ws = wsRef.current
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.addEventListener('open', () => ws.close(1000), { once: true })
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000)
        }
      }
      wsRef.current = null
      setConnected(false)
      return
    }

    let disposed = false
    let attempt = 0

    const scheduleReconnect = () => {
      if (disposed) return
      const delay = Math.min(10_000, 500 * 2 ** attempt)
      attempt += 1
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    function connect() {
      if (disposed) return
      const token = getStoredToken()
      if (!token) return

      const ws = new WebSocket(pokerWsUrl(token))
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) return
        attempt = 0
        setConnected(true)
        flushPending()
        void fetchPokerRoom().then(({ room }) => {
          if (!disposed && room) onEventRef.current({ type: 'room_state', room })
        })
        onEventRef.current({ type: 'connected' })
      }

      ws.onmessage = (ev) => {
        if (disposed) return
        try {
          onEventRef.current(JSON.parse(ev.data as string) as Parameters<WsHandler>[0])
        } catch {
          /* ignore */
        }
      }

      ws.onerror = () => {
        if (!disposed) onEventRef.current({ type: 'error', message: 'Connection error — retrying…' })
      }

      ws.onclose = () => {
        if (disposed) return
        setConnected(false)
        if (wsRef.current === ws) wsRef.current = null
        scheduleReconnect()
      }
    }

    function closeSocket(ws: WebSocket | null) {
      if (!ws) return
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      if (ws.readyState === WebSocket.CONNECTING) {
        // Avoid "closed before connection established" in React Strict Mode.
        ws.addEventListener('open', () => ws.close(1000, 'navigate'), { once: true })
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'navigate')
      }
    }

    connect()

    return () => {
      disposed = true
      pendingRef.current = []
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      closeSocket(wsRef.current)
      wsRef.current = null
      setConnected(false)
    }
  }, [userId, flushPending])

  return { connected, send, wsRef }
}
