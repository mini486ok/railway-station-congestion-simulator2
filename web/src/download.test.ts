import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { bundleToZip } from './download'

describe('bundleToZip', () => {
  it('packs files into a zip blob that can be re-read', async () => {
    const blob = await bundleToZip({ 'a.csv': 'hello', 'b.csv': 'world' })
    expect(blob).toBeInstanceOf(Blob)
    const zip = await JSZip.loadAsync(blob)
    expect(await zip.file('a.csv')!.async('string')).toBe('hello')
    expect(await zip.file('b.csv')!.async('string')).toBe('world')
  })
})
