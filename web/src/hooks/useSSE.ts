import { useEffect, useRef } from 'react'
import { apiUrl } from '../config/api'

interface SSEOptions {
  onMessage: (data: any) => void
  onError?: (error: Error) => void
  onOpen?: () => void
  onClose?: () => void
}

export function useSSE(path: string | null, options: SSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!path) return

    const eventSource = new EventSource(apiUrl(path))
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('SSE connection opened')
      options.onOpen?.()
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        options.onMessage(data)
      } catch (error) {
        console.error('Failed to parse SSE data:', error)
        options.onError?.(error as Error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
      options.onError?.(new Error('SSE connection failed'))
      eventSource.close()
    }

    return () => {
      eventSource.close()
      eventSourceRef.current = null
      options.onClose?.()
    }
  }, [path])

  return {
    close: () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }
}