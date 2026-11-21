// Downloads the latest full price + promotion files for our 3 stores into raw/ (unzipped XML).
import { Client } from 'basic-ftp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Writable } from 'node:stream'

export const STORES = [
  { key: 'rami', chain: 'רמי לוי', user: 'RamiLevi', chainId: '7290058140886', store: '034' },
  { key: 'osher', chain: 'אושר עד', user: 'osherad', chainId: '7290103152017', store: '010' },
  { key: 'yoh', chain: 'יוחננוף', user: 'yohananof', chainId: '7290803800003', store: '021' },
]
const HOST = 'url.retail.publishedprices.co.il'

/** XML files come as UTF-16 (with a BOM) or UTF-8. */
export const decode = (buf) => (buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le').slice(1) : buf.toString('utf8').replace(/^﻿/, ''))

async function fetchFile(client, name) {
  const chunks = []
  await client.downloadTo(new Writable({ write(c, _e, cb) { chunks.push(c); cb() } }), name)
  const buf = Buffer.concat(chunks)
  return decode(name.endsWith('.gz') ? gunzipSync(buf) : buf)
}

export async function downloadAll(dir = 'raw') {
  mkdirSync(dir, { recursive: true })
  const out = {}
  for (const s of STORES) {
    const client = new Client(60_000)
    try {
      await client.access({ host: HOST, user: s.user, password: '' })
      const names = (await client.list()).map((f) => f.name)
      const latest = (prefix) => names.filter((n) => n.startsWith(prefix) && n.includes(`-${s.store}-`)).sort().pop()
      const price = latest('PriceFull')
      const promo = latest('PromoFull')
      const stores = names.filter((n) => n.startsWith('Stores')).sort().pop()
      if (!price) throw new Error(`no PriceFull for ${s.key}`)
      out[s.key] = {
        price: await fetchFile(client, price),
        promo: promo ? await fetchFile(client, promo) : '',
        stores: stores ? await fetchFile(client, stores) : '',
        files: { price, promo, stores },
      }
      writeFileSync(`${dir}/${s.key}-price.xml`, out[s.key].price)
      if (promo) writeFileSync(`${dir}/${s.key}-promo.xml`, out[s.key].promo)
      console.log(s.key, price, promo ?? '(no promo file)')
    } finally {
      client.close()
    }
  }
  return out
}

