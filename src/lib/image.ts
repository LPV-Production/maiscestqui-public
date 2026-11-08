// Redimensionne une image (fichier ou URL de même origine) en JPEG léger pour la base.
export function toJpegDataUrl(src: File | string, width = 300, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    img.onload = () => {
      const w = Math.min(width, img.naturalWidth)
      const h = Math.round((img.naturalHeight * w) / img.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error("Impossible de lire l'image."))
    img.src = url
  })
}
