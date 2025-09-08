import React from 'react'
import { apiUrl, API_CONFIG } from '../config/api'

type Props = { outputName: string, limit?: number, onOpen?: (images: string[], index: number) => void }

export default function SampleGallery({ outputName, limit = 20, onOpen }: Props) {
  const [images, setImages] = React.useState<string[]>([])

  const fetchImages = React.useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/outputs/${encodeURIComponent(outputName)}/images?offset=0&limit=${limit}`))
      const j = await res.json()
      if (j?.ok && Array.isArray(j.images)) setImages(j.images)
    } catch {}
  }, [outputName, limit])

  React.useEffect(() => {
    fetchImages()
    const id = setInterval(fetchImages, 5000)
    return () => clearInterval(id)
  }, [fetchImages])

  if (!images.length) return null

  return (
    <div className="w-full overflow-auto">
      <div className="text-xs text-zinc-400 mb-1">Recent samples</div>
      <div className="grid grid-cols-8 md:grid-cols-12 gap-1">
        {images.slice(0, limit).map((src, i) => {
          const full = src.startsWith('http') ? src : `${API_CONFIG.baseUrl}${src}`
          return (
            <button key={i} onClick={() => onOpen && onOpen(images, i)} className="group block w-full">
              <img
                src={full}
                alt={`sample_${i}`}
                loading="lazy"
                decoding="async"
                className="w-full h-16 object-cover rounded border border-zinc-800 group-hover:opacity-90"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
