import { saveAs } from 'file-saver'
import JSZip from 'jszip'

export function saveText(filename: string, text: string): void {
  saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename)
}

export function saveBlob(filename: string, blob: Blob): void {
  saveAs(blob, filename)
}

export async function bundleToZip(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  return zip.generateAsync({ type: 'blob' })
}
