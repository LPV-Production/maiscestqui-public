// Lecture du texte d'une photo de page, directement dans le navigateur (gratuit, rien n'est envoyé ailleurs
// que le texte obtenu). Tesseract est chargé à la demande pour ne pas alourdir l'app.
export async function readPhoto(file: File, onProgress: (pct: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('fra', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(Math.round(m.progress * 100))
    }
  })
  try {
    const {
      data: { text }
    } = await worker.recognize(file)
    return text.replace(/-\n(\p{Ll})/gu, '$1').replace(/[ \t]+/g, ' ').trim()
  } finally {
    await worker.terminate()
  }
}
