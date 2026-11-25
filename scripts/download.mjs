// Downloads the latest full price + promotion files for our 3 stores into raw/ (unzipped XML).
// The chains publish them on the price-transparency site (Cerberus). Its FTP port was closed in
// Nov 2026, so we use its web interface: sign in with the chain's user (no password), list, download.
import { mkdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Since 2026-11-25 the household compares Rami Levy only. To bring a chain back, uncomment its line.
// (Osher Ad publishes its daily file only around 08:00 Israel time, after this job runs.)
export const STORES = [
  { key: 'rami', chain: 'רמי לוי', user: 'RamiLevi', chainId: '7290058140886', store: '034' },
  // { key: 'osher', chain: 'אושר עד', user: 'osherad', chainId: '7290103152017', store: '010' },
  // { key: 'yoh', chain: 'יוחננוף', user: 'yohananof', chainId: '7290803800003', store: '021' },
]
const BASE = 'https://url.publishedprices.co.il'

/** XML files come as UTF-16 (with a BOM) or UTF-8. */
export const decode = (buf) => (buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le').slice(1) : buf.toString('utf8').replace(/^﻿/, ''))

const csrfOf = (html) => (html.match(/name="csrftoken"\s+content="([^"]+)"/) || html.match(/id="csrftoken"[^>]*value="([^"]+)"/) || [])[1]

/** One signed-in session on the site for one chain (cookies kept between requests). */
async function session(user) {
  const jar = new Map()
  const go = async (path, opt = {}) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(BASE + path, {
          redirect: 'manual',
          signal: AbortSignal.timeout(120_000),
          ...opt,
          headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(opt.headers ?? {}) },
        })
        for (const c of r.headers.getSetCookie()) {
          const [kv] = c.split(';')
          const i = kv.indexOf('=')
          jar.set(kv.slice(0, i), kv.slice(i + 1))
        }
        return r
      } catch (e) {
        if (attempt >= 3) throw e
        await new Promise((res) => setTimeout(res, 5000 * attempt))
      }
    }
  }
  const form = (body) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })

  let csrf = csrfOf(await (await go('/login')).text())
  const login = await go('/login/user', form({ r: '', username: user, password: '', Submit: 'Sign in', csrftoken: csrf ?? '' }))
  if (login.status !== 302 || !/\/file/.test(login.headers.get('location') ?? '')) throw new Error(`login failed for ${user} (${login.status})`)
  csrf = csrfOf(await (await go('/file')).text()) ?? csrf

  return {
    async list() {
      const r = await go('/file/json/dir', form({ sEcho: '1', iColumns: '5', iDisplayStart: '0', iDisplayLength: '100000', sSearch: '', cd: '/', csrftoken: csrf ?? '' }))
      if (!r.ok) throw new Error(`listing failed for ${user} (${r.status})`)
      return ((await r.json()).aaData ?? []).map((f) => f.name ?? f.fname).filter(Boolean)
    },
    async file(name) {
      const r = await go('/file/d/' + encodeURIComponent(name))
      if (!r.ok) throw new Error(`download failed: ${name} (${r.status})`)
      const buf = Buffer.from(await r.arrayBuffer())
      return decode(name.endsWith('.gz') ? gunzipSync(buf) : buf)
    },
  }
}

export async function downloadAll(dir = 'raw') {
  mkdirSync(dir, { recursive: true })
  const out = {}
  for (const s of STORES) {
    const site = await session(s.user)
    const names = await site.list()
    const latest = (prefix) => names.filter((n) => n.startsWith(prefix) && n.includes(`-${s.store}-`)).sort().pop()
    const price = latest('PriceFull')
    const promo = latest('PromoFull')
    const stores = names.filter((n) => n.startsWith('Stores')).sort().pop()
    if (!price) throw new Error(`no PriceFull for ${s.key}`)
    out[s.key] = {
      price: await site.file(price),
      promo: promo ? await site.file(promo) : '',
      stores: stores ? await site.file(stores) : '',
      files: { price, promo, stores },
    }
    writeFileSync(`${dir}/${s.key}-price.xml`, out[s.key].price)
    if (promo) writeFileSync(`${dir}/${s.key}-promo.xml`, out[s.key].promo)
    console.log(s.key, price, promo ?? '(no promo file)')
  }
  return out
}
