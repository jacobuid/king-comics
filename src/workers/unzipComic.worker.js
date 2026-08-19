import { unzipSync } from 'fflate'

const imagePattern = /\.(avif|bmp|gif|jpe?g|png|webp)$/i

self.addEventListener('message', (event) => {
  try {
    const files = unzipSync(new Uint8Array(event.data))
    const images = Object.entries(files)
      .filter(([path]) => imagePattern.test(path))
      .map(([path, bytes]) => {
        const data = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes.buffer
          : bytes.slice().buffer
        return { path, data }
      })

    self.postMessage({ images }, images.map(({ data }) => data))
  } catch (error) {
    self.postMessage({ error: error.message || 'Could not extract this CBZ archive.' })
  }
})
