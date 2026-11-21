// Daily job: downloads full prices + promotions for our 3 stores and writes one compact
// data/prices.json for the app. Runs on GitHub Actions (free); the app reads it from GitHub Pages.
import { mkdirSync, writeFileSync } from 'node:fs'
import { STORES, downloadAll } from './download.mjs'

const tag = (b, t) => (b.match(new RegExp('<' + t + '>([^<]*)</' + t + '>')) || [])[1]?.trim() ?? ''
const blocks = (xml, t) => xml.split('<' + t + '>').slice(1)
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const num = (s) => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function storeInfo(storesXml, storeId) {
  for (const b of blocks(storesXml, 'Store')) {
    if (Number(tag(b, 'StoreID') || tag(b, 'StoreId')) === Number(storeId)) {
      return { name: unescape(tag(b, 'StoreName')), address: unescape(tag(b, 'Address')) }
    }
  }
  return { name: '', address: '' }
}

const raw = await downloadAll('raw')
const now = new Date()
const items = {} // code -> [name, manufacturer, qtyText, weighted, prices[], unitPrices[], unitOfMeasure]
const promos = [] // [storeIdx, minQty, totalPrice, description, isClub]
const promoOf = {} // code -> promo indexes

STORES.forEach((s, si) => {
  const r = raw[s.key]
  for (const b of blocks(r.price, 'Item')) {
    const code = tag(b, 'ItemCode')
    const price = num(tag(b, 'ItemPrice'))
    if (!code || price === null) continue
    if (!items[code]) {
      const qty = tag(b, 'Quantity')
      const unit = tag(b, 'UnitQty')
      items[code] = [
        unescape(tag(b, 'ItemName')),
        unescape(tag(b, 'ManufactureName') || tag(b, 'ManufacturerName')).replace(/^לא ידוע$/, ''),
        Number(qty) > 0 && unit && !/לא ידוע/.test(unit) ? `${Number(qty)} ${unit}` : '',
        tag(b, 'bIsWeighted') === '1' ? 1 : 0,
        STORES.map(() => null),
        STORES.map(() => null),
        tag(b, 'UnitOfMeasure'),
      ]
    }
    items[code][4][si] = price
    items[code][5][si] = num(tag(b, 'UnitOfMeasurePrice'))
  }

  for (const p of blocks(r.promo, 'Promotion')) {
    const start = new Date(tag(p, 'PromotionStartDateTime') || 0)
    const end = new Date(tag(p, 'PromotionEndDateTime') || '2100-01-01')
    if (start > now || end < now) continue
    const pItems = blocks(p, 'PromotionItem')
    if (pItems.length === 0) continue
    const minQty = Math.max(1, Math.round(Number(tag(pItems[0], 'MinQty')) || 1))
    const total = num(tag(pItems[0], 'DiscountedPrice'))
    if (total === null) continue
    const idx = promos.length
    // "Conditional" = club members only, a coupon, or a minimum basket amount. Shown, but never counted.
    const conditional =
      tag(p, 'ClubID') !== '0' || tag(p, 'AdditionalIsCoupon') === '1' || Number(tag(p, 'MinPurchaseAmount')) > 0
    promos.push([si, minQty, total, unescape(tag(p, 'PromotionDescription')).replace(/\s+/g, ' '), conditional ? 1 : 0])
    for (const it of pItems) {
      const code = tag(it, 'ItemCode')
      if (!code) continue
      ;(promoOf[code] ??= []).push(idx)
    }
  }
})

// Keep only promotions on items we actually have a price for.
for (const code of Object.keys(promoOf)) if (!items[code]) delete promoOf[code]

const out = {
  updated: now.toISOString(),
  stores: STORES.map((s) => ({ key: s.key, chain: s.chain, ...storeInfo(raw[s.key].stores, s.store) })),
  items,
  promos,
  promoOf,
}
mkdirSync('data', { recursive: true })
writeFileSync('data/prices.json', JSON.stringify(out))
console.log('items', Object.keys(items).length, 'promos', promos.length, 'bytes', JSON.stringify(out).length)
