import { saveAs } from 'file-saver'
import JSZip from 'jszip'

const UTF8_BOM = '﻿'

export function withBom(text: string): string {
  return UTF8_BOM + text
}

export function saveText(filename: string, text: string): void {
  saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename)
}

export function saveCsv(filename: string, text: string): void {
  saveAs(new Blob([UTF8_BOM + text], { type: 'text/csv;charset=utf-8' }), filename)
}

export function saveBlob(filename: string, blob: Blob): void {
  saveAs(blob, filename)
}

export async function bundleToZip(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) {
    const isCsv = name.toLowerCase().endsWith('.csv')
    zip.file(name, isCsv ? UTF8_BOM + content : content)
  }
  return zip.generateAsync({ type: 'blob' })
}
