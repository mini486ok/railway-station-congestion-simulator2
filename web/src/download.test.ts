import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { bundleToZip, withBom } from './download'

const UTF8_BOM = '﻿'

describe('withBom', () => {
  it('prepends UTF-8 BOM to text', () => {
    expect(withBom('헤더\n값')).toBe(UTF8_BOM + '헤더\n값')
  })

  it('starts with BOM character', () => {
    const result = withBom('test')
    expect(result.charCodeAt(0)).toBe(0xFEFF)
  })
})

describe('bundleToZip', () => {
  it('packs files into a zip blob that can be re-read', async () => {
    const blob = await bundleToZip({ 'a.csv': 'hello', 'b.csv': 'world' })
    expect(blob).toBeInstanceOf(Blob)
    const zip = await JSZip.loadAsync(blob)
    // CSV entries get a BOM prepended
    expect(await zip.file('a.csv')!.async('string')).toBe(UTF8_BOM + 'hello')
    expect(await zip.file('b.csv')!.async('string')).toBe(UTF8_BOM + 'world')
  })

  it('prepends BOM to csv entries', async () => {
    const blob = await bundleToZip({ 'a.csv': '헤더\n값' })
    const zip = await JSZip.loadAsync(blob)
    const content = await zip.file('a.csv')!.async('string')
    expect(content.startsWith(UTF8_BOM)).toBe(true)
    expect(content).toBe(UTF8_BOM + '헤더\n값')
  })

  it('does NOT prepend BOM to non-csv entries', async () => {
    const blob = await bundleToZip({ 'data.json': '{"key":"value"}' })
    const zip = await JSZip.loadAsync(blob)
    const content = await zip.file('data.json')!.async('string')
    expect(content.startsWith(UTF8_BOM)).toBe(false)
    expect(content).toBe('{"key":"value"}')
  })

  it('handles mixed csv and non-csv entries', async () => {
    const blob = await bundleToZip({
      'table.csv': 'a,b\n1,2',
      'config.json': '{}',
    })
    const zip = await JSZip.loadAsync(blob)
    const csv = await zip.file('table.csv')!.async('string')
    const json = await zip.file('config.json')!.async('string')
    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(json.startsWith(UTF8_BOM)).toBe(false)
  })
})
