import {
  serial as test
} from 'ava'
import BigNumber from 'bignumber.js'
import crypto from 'crypto'
import anonize from 'node-anonize2-relic'
import uuidV4 from 'uuid/v4'
import { sign } from 'http-request-signature'
import tweetnacl from 'tweetnacl'
import _ from 'underscore'
import {
  signTxn,
  agents,
  ok,
  setupCreatePayload,
  createSurveyor,
  cleanDbs,
  cleanGrantDb,
  setupForwardingServer,
  connectToDb
} from '../utils'
import {
  timeout,
  uint8tohex
} from 'bat-utils/lib/extras-utils'

import {
  routes as grantsRoutes,
  initialize as grantsInitializer
} from '../../ledger/controllers/grants'
import {
  routes as registrarRoutes,
  initialize as registrarInitializer
} from '../../ledger/controllers/registrar'
import {
  routes as walletRoutes,
  initialize as walletInitializer
} from '../../ledger/controllers/wallet'

test.before(cleanDbs)
test.after(cleanDbs)
test.afterEach.always(cleanDbs)

const bypassCooldown = process.env.WALLET_COOLDOWN_BYPASS_TOKEN
const promotionId = 'c96c39c8-77dd-4b2d-a8df-2ecf824bc9e9'
// expired grant
const expired = { 'grants': ['eyJhbGciOiJFZERTQSIsImtpZCI6IiJ9.eyJhbHRjdXJyZW5jeSI6IkJBVCIsImdyYW50SWQiOiI0Y2ZjMzFmYy1mYjE1LTRmMTUtOTc0Zi0zNzJiMmI0YzBkYjYiLCJwcm9iaSI6IjMwMDAwMDAwMDAwMDAwMDAwMDAwIiwicHJvbW90aW9uSWQiOiJjOTZjMzljOC03N2RkLTRiMmQtYThkZi0yZWNmODI0YmM5ZTkiLCJtYXR1cml0eVRpbWUiOjE1MjY5NDE0MDAsImV4cGlyeVRpbWUiOjE1MjUxNzYwMDB9.iZBTNb9zilKubYYwYuc9MIUHZq0iv-7DsmnNu0GakeiEjcNqgbgbg-Wc2dowlMmMyjRbXjDUIC8rK4FiIqH8CQ'], 'promotions': [{ promotionId, 'priority': 0, 'active': true, 'minimumReconcileTimestamp': 1526941400000, 'protocolVersion': 4, 'type': 'ugp' }] }

const BAT_CAPTCHA_BRAVE_TOKEN = 'eyJhbGciOiJSUzI1NiIsIng1YyI6WyJNSUlGbERDQ0JIeWdBd0lCQWdJUkFNT3RpVDR3L29IcUNBQUFBQUFmUjNRd0RRWUpLb1pJaHZjTkFRRUxCUUF3UWpFTE1Ba0dBMVVFQmhNQ1ZWTXhIakFjQmdOVkJBb1RGVWR2YjJkc1pTQlVjblZ6ZENCVFpYSjJhV05sY3pFVE1CRUdBMVVFQXhNS1IxUlRJRU5CSURGUE1UQWVGdzB4T1RFeE1UUXdPVFEwTURkYUZ3MHlNREF5TVRJd09UUTBNRGRhTUd3eEN6QUpCZ05WQkFZVEFsVlRNUk13RVFZRFZRUUlFd3BEWVd4cFptOXlibWxoTVJZd0ZBWURWUVFIRXcxTmIzVnVkR0ZwYmlCV2FXVjNNUk13RVFZRFZRUUtFd3BIYjI5bmJHVWdURXhETVJzd0dRWURWUVFERXhKaGRIUmxjM1F1WVc1a2NtOXBaQzVqYjIwd2dnRWlNQTBHQ1NxR1NJYjNEUUVCQVFVQUE0SUJEd0F3Z2dFS0FvSUJBUUQyKzBXdDA4ZHI4dm9GYXE4dUpWNDkvNDVwcFg5ZUJiWTk4bFpQNURmSW85dkRJYzBXSzE0YllvQy8xWkxIc1ZvZXZ2WkdSRGJ0eThBRkFMSyt3dlgwMkxqMm1OYUhLZFJ1Sll2U0pabWtQTDMwbGxkQzQ4a3d6YnIyWjEzN0Znb1luQ1RxT3FNa1p5K2dWRmNsVENVaVVoZUQyQlppbU9pZEVYamU0dTExeWhLdlNjTG5zRnFrUUpjdkxyaTZJOU40TVVsRDRQblR4c3FRVjE4N3hDNHAxVVdCVTN4NVN1ejVITXlIVkxHS1NiZTRWM2Y3WFh0U0hUK0czc1lyRFZUbnZ0eXBEUWpwWmM1TUY3RjNBdTQycW4xSERES2d5b1hESy82YkZqNVVHOVlROW9Qc2x2RXRob1gvdWdGY0FXUzQ3d1YvUmROdUkvay8rSXZGZUJmUkFnTUJBQUdqZ2dKWk1JSUNWVEFPQmdOVkhROEJBZjhFQkFNQ0JhQXdFd1lEVlIwbEJBd3dDZ1lJS3dZQkJRVUhBd0V3REFZRFZSMFRBUUgvQkFJd0FEQWRCZ05WSFE0RUZnUVVPVnRuemIwbUlyZGsrR3YrMmNDai9PQm5tY0l3SHdZRFZSMGpCQmd3Rm9BVW1OSDRiaERyejV2c1lKOFlrQnVnNjMwSi9Tc3daQVlJS3dZQkJRVUhBUUVFV0RCV01DY0dDQ3NHQVFVRkJ6QUJoaHRvZEhSd09pOHZiMk56Y0M1d2Eya3VaMjl2Wnk5bmRITXhiekV3S3dZSUt3WUJCUVVITUFLR0gyaDBkSEE2THk5d2Eya3VaMjl2Wnk5bmMzSXlMMGRVVXpGUE1TNWpjblF3SFFZRFZSMFJCQll3RklJU1lYUjBaWE4wTG1GdVpISnZhV1F1WTI5dE1DRUdBMVVkSUFRYU1CZ3dDQVlHWjRFTUFRSUNNQXdHQ2lzR0FRUUIxbmtDQlFNd0x3WURWUjBmQkNnd0pqQWtvQ0tnSUlZZWFIUjBjRG92TDJOeWJDNXdhMmt1WjI5dlp5OUhWRk14VHpFdVkzSnNNSUlCQlFZS0t3WUJCQUhXZVFJRUFnU0I5Z1NCOHdEeEFIY0FzaDRGekl1aXpZb2dUb2RtK1N1NWlpVWdaMnZhK25EbnNrbFRMZStMa0Y0QUFBRnVhWU5oclFBQUJBTUFTREJHQWlFQWdKeTRLVUdXdEdWS1h3eXV4Wk0rTWhUR2wxTElGOFFwclBWS2VYNTZBTThDSVFEeUs1SEFldnRmSzl2OFhWYUpVZnJ5NlEzakRobWxzOGpGZG12TW56VkI0QUIyQUY2bmMvbmZWc0RudFRaSWZkQko0REo2a1pvTWhLRVNFb1FZZFphQmNVVllBQUFCYm1tRFlka0FBQVFEQUVjd1JRSWdXa0RqSTIwaUd5TnNjS1hvVS9RK1EwcER0dit1blJKWXpSUVBLSTUxN3lNQ0lRQzZQNVoxK0djZHp5d05EUkhoZERnWktPekdTbldRMFgvcERYMkVlbUc2eGpBTkJna3Foa2lHOXcwQkFRc0ZBQU9DQVFFQWlBMlVsSVdMcG5FNVBwUWJKV1NlMElua0tKYWZldUJtZU9EU2RVS21wZnd2cURDTjRORHRQUUpDRjFpVk5WekRIRWJvdlpmdkx2OC9OUFp6bGsvZS83NkpzVi92c2tZdFdZYm15enZYYXMxOGZIaGlXemRLR2cwdUZuaWNHOG1sRFFvdHRuVnZoZlhWUnFUb3pNaktoSGM5Ui9Eays0YUw2eGtWTlBSUkRNZ3A5eURXN2dZenk0T0JNL1lFWnI2amdMOXB5NmErM3M5R0NXcmUzRGNxa05tZDh4RWhodFltS3ZuK1ZUUW11WkxRZmE4bityZm5LME11bWdTMGhDNDZsbitQeUpVMzA1bDdkbitDSmc0M1Z1UW5OemFiVWhsVWZyS0dDWURjMy9vZi9iTnVMTzFmRUZvVkRDcHRINlMrQmJ6UFYvcEJKcWwzbzlsWmZQdXJWQT09IiwiTUlJRVNqQ0NBektnQXdJQkFnSU5BZU8wbXFHTmlxbUJKV2xRdURBTkJna3Foa2lHOXcwQkFRc0ZBREJNTVNBd0hnWURWUVFMRXhkSGJHOWlZV3hUYVdkdUlGSnZiM1FnUTBFZ0xTQlNNakVUTUJFR0ExVUVDaE1LUjJ4dlltRnNVMmxuYmpFVE1CRUdBMVVFQXhNS1IyeHZZbUZzVTJsbmJqQWVGdzB4TnpBMk1UVXdNREF3TkRKYUZ3MHlNVEV5TVRVd01EQXdOREphTUVJeEN6QUpCZ05WQkFZVEFsVlRNUjR3SEFZRFZRUUtFeFZIYjI5bmJHVWdWSEoxYzNRZ1UyVnlkbWxqWlhNeEV6QVJCZ05WQkFNVENrZFVVeUJEUVNBeFR6RXdnZ0VpTUEwR0NTcUdTSWIzRFFFQkFRVUFBNElCRHdBd2dnRUtBb0lCQVFEUUdNOUYxSXZOMDV6a1FPOSt0TjFwSVJ2Snp6eU9USFc1RHpFWmhEMmVQQ252VUEwUWsyOEZnSUNmS3FDOUVrc0M0VDJmV0JZay9qQ2ZDM1IzVlpNZFMvZE40WktDRVBaUnJBekRzaUtVRHpScm1CQko1d3VkZ3puZElNWWNMZS9SR0dGbDV5T0RJS2dqRXYvU0pIL1VMK2RFYWx0TjExQm1zSytlUW1NRisrQWN4R05ocjU5cU0vOWlsNzFJMmROOEZHZmNkZHd1YWVqNGJYaHAwTGNRQmJqeE1jSTdKUDBhTTNUNEkrRHNheG1LRnNianphVE5DOXV6cEZsZ09JZzdyUjI1eG95blV4djh2Tm1rcTd6ZFBHSFhreFdZN29HOWorSmtSeUJBQms3WHJKZm91Y0JaRXFGSkpTUGs3WEEwTEtXMFkzejVvejJEMGMxdEpLd0hBZ01CQUFHamdnRXpNSUlCTHpBT0JnTlZIUThCQWY4RUJBTUNBWVl3SFFZRFZSMGxCQll3RkFZSUt3WUJCUVVIQXdFR0NDc0dBUVVGQndNQ01CSUdBMVVkRXdFQi93UUlNQVlCQWY4Q0FRQXdIUVlEVlIwT0JCWUVGSmpSK0c0UTY4K2I3R0NmR0pBYm9PdDlDZjByTUI4R0ExVWRJd1FZTUJhQUZKdmlCMWRuSEI3QWFnYmVXYlNhTGQvY0dZWXVNRFVHQ0NzR0FRVUZCd0VCQkNrd0p6QWxCZ2dyQmdFRkJRY3dBWVlaYUhSMGNEb3ZMMjlqYzNBdWNHdHBMbWR2YjJjdlozTnlNakF5QmdOVkhSOEVLekFwTUNlZ0phQWpoaUZvZEhSd09pOHZZM0pzTG5CcmFTNW5iMjluTDJkemNqSXZaM055TWk1amNtd3dQd1lEVlIwZ0JEZ3dOakEwQmdabmdRd0JBZ0l3S2pBb0JnZ3JCZ0VGQlFjQ0FSWWNhSFIwY0hNNkx5OXdhMmt1WjI5dlp5OXlaWEJ2YzJsMGIzSjVMekFOQmdrcWhraUc5dzBCQVFzRkFBT0NBUUVBR29BK05ubjc4eTZwUmpkOVhsUVdOYTdIVGdpWi9yM1JOR2ttVW1ZSFBRcTZTY3RpOVBFYWp2d1JUMmlXVEhRcjAyZmVzcU9xQlkyRVRVd2daUStsbHRvTkZ2aHNPOXR2QkNPSWF6cHN3V0M5YUo5eGp1NHRXRFFIOE5WVTZZWlovWHRlRFNHVTlZekpxUGpZOHEzTUR4cnptcWVwQkNmNW84bXcvd0o0YTJHNnh6VXI2RmI2VDhNY0RPMjJQTFJMNnUzTTRUenMzQTJNMWo2YnlrSllpOHdXSVJkQXZLTFdadS9heEJWYnpZbXFtd2ttNXpMU0RXNW5JQUpiRUxDUUNad01INTZ0MkR2cW9meHM2QkJjQ0ZJWlVTcHh1Nng2dGQwVjdTdkpDQ29zaXJTbUlhdGovOWRTU1ZEUWliZXQ4cS83VUs0djRaVU44MGF0blp6MXlnPT0iXX0.eyJub25jZSI6IlU1RTczZTVXSVp4ZzdFMHRUU1ZuMUltazVpb2FHMTRHIiwidGltZXN0YW1wTXMiOjE1Nzc4MjU0MTMyOTIsImFwa1BhY2thZ2VOYW1lIjoiY29tLmJyYXZlLmJyb3dzZXJfZGVmYXVsdCIsImFwa0RpZ2VzdFNoYTI1NiI6Ii8wV2pWQlgwUitmK2FLeHFCaGhGT09neEV0aVZHT0srSmttQmRxVE42MGc9IiwiY3RzUHJvZmlsZU1hdGNoIjp0cnVlLCJhcGtDZXJ0aWZpY2F0ZURpZ2VzdFNoYTI1NiI6WyJNcUw4ZE5jeEVGaFo1YWhkOFcyVjhRTFlXeUlKbTRCa3hkaVJYR0hhMGVBPSJdLCJiYXNpY0ludGVncml0eSI6dHJ1ZX0.5i37QY58rcprxOYLDyeU9T2xHoqrwEdEbeY6ypKmtnZROzuO6zYDJkijrC3bLUs_nc9df9DMvOOEyxVJYA_jye8ukbUohGwcsIzf3TYWtYCeE1jnk6WEmTCUCrnGMt5uPORxXvXNoAHvDfZpidwBHJpAV-BuyfIZsrM47IXy8xhLT0Qtp7hWS8lLshV36WWkmh2kQNwhzZHGEdVu3FO6xdCPGG7fNnjFUim7mAGPVeDb0_tE8KShl0qWv0uCKGbQUQh1p4wRXgrqkELEZdDGfotKul5iYSHKbAM7hYVfzOVH4G2JhLlZ-m662T-2rEOrSJlJ74WI850fd73UHIDojA'
const BAT_CAPTCHA_BRAVE_NONCE = 'U5E73e5WIZxg7E0tTSVn1Imk5ioaG14G'

async function createPromotion (type, platform, active) {
  const result = await this.grants.post('/v1/promotions')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${process.env.GRANT_TOKEN}`)
    .send({
      type,
      numGrants: 1,
      value: '15.0',
      platform,
      active
    }).expect(ok)
  return result.body
}

test.before(async (t) => {
  const { agent } = await setupForwardingServer({
    token: null,
    routes: [].concat(grantsRoutes, registrarRoutes, walletRoutes),
    initers: [grantsInitializer, registrarInitializer, walletInitializer],
    config: {
      forward: {
        grants: '1'
      }
    }
  })
  t.context.createPromotion = createPromotion
  t.context.grants = agents.grants.global
  t.context.ledger = agent
})

test('grants: drain grants', async t => {
  const ledgerDB = await connectToDb('ledger')
  const wallets = ledgerDB.collection('wallets')

  const personaId = uuidV4().toLowerCase()

  var response = await t.context.ledger.get('/v2/registrar/persona').expect(ok)
  const personaCredential = new anonize.Credential(personaId, response.body.registrarVK)

  const keypair = tweetnacl.sign.keyPair()
  let body = {
    label: uuidV4().toLowerCase(),
    currency: 'BAT',
    publicKey: uint8tohex(keypair.publicKey)
  }
  var octets = JSON.stringify(body)
  var headers = {
    digest: 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64')
  }

  headers.signature = sign({
    headers: headers,
    keyId: 'primary',
    secretKey: uint8tohex(keypair.secretKey)
  }, { algorithm: 'ed25519' })

  var payload = { requestType: 'httpSignature',
    request: {
      body: body,
      headers: headers,
      octets: octets
    },
    proof: personaCredential.request()
  }
  response = await t.context.ledger.post('/v2/registrar/persona/' + personaCredential.parameters.userId)
    .send(payload).expect(ok)
  const paymentId = response.body.wallet.paymentId

  const androidPromotion = await t.context.createPromotion('ugp', 'android', true)

  response = await t.context.ledger.get('/v5/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(ok)
  let promotion = response.body

  t.is(promotion.promotionId, androidPromotion.id)
  t.is(promotion.type, 'android')

  // Cannot claim from ads geo
  await t.context.ledger
    .put(`/v3/grants/${paymentId}`)
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'US')
    .send({ promotionId: androidPromotion.id })
    .expect(400)

  await t.context.ledger
    .get(`/v4/captchas/${paymentId}`)
    .set('brave-product', 'brave-core')
    .expect(ok)

  const { captcha } = await wallets.findOne({ paymentId })

  // Cannot claim android grant with desktop solution
  await t.context.ledger
    .put(`/v4/grants/${paymentId}`)
    .send({
      promotionId: androidPromotion.id,
      captchaResponse: {
        x: captcha.x,
        y: captcha.y
      }
    })
    .expect(404)

  await wallets.update({
    paymentId
  }, {
    $set: {
      nonce: BAT_CAPTCHA_BRAVE_NONCE
    }
  })

  await t.context.ledger
    .put(`/v3/grants/${paymentId}`)
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'JA')
    .send({ promotionId: androidPromotion.id })
    .expect(200)

  await t.context.ledger.get('/v5/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(404)

  response = await t.context.ledger.get(`/v2/wallet/${paymentId}?refresh=true`)
    .expect(200)
  let walletInfo = response.body
  t.is(walletInfo.grants.length, 1)
  t.true(new BigNumber(walletInfo.balance).equals('15.0'))
  // FIXME
  t.true(new BigNumber(walletInfo.cardBalance).equals('0.0'))

  const settlement = process.env.BAT_SETTLEMENT_ADDRESS

  const txn = {
    destination: settlement,
    denomination: {
      currency: 'BAT',
      amount: '0.0' // FIXME
    }
  }
  body = { signedTx: signTxn(keypair, txn) }
  await t.context.ledger
    .post(`/v2/wallet/${paymentId}/claim`)
    .send(body)
    .expect(200)

  response = await t.context.ledger.get(`/v2/wallet/${paymentId}?refresh=true`)
    .expect(200)
  walletInfo = response.body
  // FIXME
  t.true(new BigNumber(walletInfo.balance).equals('15.0'))
})

test('grants: fetch available promotions', async t => {
  const androidPromotion = await t.context.createPromotion('ugp', 'android', true)

  // Desktop should not show any grants
  await t.context.ledger.get('/v4/grants').expect(404)

  // Android should show a single grant
  let response = await t.context.ledger.get('/v5/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(ok)
  let promotion = response.body

  t.is(promotion.promotionId, androidPromotion.id)
  t.is(promotion.type, 'android')

  await cleanGrantDb()

  await t.context.createPromotion('ugp', 'android', false)

  await t.context.ledger.get('/v4/grants').expect(404)
  await t.context.ledger.get('/v5/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(404)

  await t.context.createPromotion('ugp', '', true)

  await t.context.ledger.get('/v5/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(ok)
  response = await t.context.ledger.get('/v4/grants').expect(ok)

  let promotions = response.body.grants
  t.is(promotions.length, 1)

  await t.context.createPromotion('ugp', '', true)

  response = await t.context.ledger.get('/v4/grants').expect(ok)

  promotions = response.body.grants
  t.is(promotions.length, 2)
})

test('grants: claim promotions', async t => {
  const ledgerDB = await connectToDb('ledger')
  const wallets = ledgerDB.collection('wallets')

  const personaId = uuidV4().toLowerCase()

  var response = await t.context.ledger.get('/v2/registrar/persona').expect(ok)
  const personaCredential = new anonize.Credential(personaId, response.body.registrarVK)

  const keypair = tweetnacl.sign.keyPair()
  const body = {
    label: uuidV4().toLowerCase(),
    currency: 'BAT',
    publicKey: uint8tohex(keypair.publicKey)
  }
  var octets = JSON.stringify(body)
  var headers = {
    digest: 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64')
  }

  headers.signature = sign({
    headers: headers,
    keyId: 'primary',
    secretKey: uint8tohex(keypair.secretKey)
  }, { algorithm: 'ed25519' })

  var payload = { requestType: 'httpSignature',
    request: {
      body: body,
      headers: headers,
      octets: octets
    },
    proof: personaCredential.request()
  }
  response = await t.context.ledger.post('/v2/registrar/persona/' + personaCredential.parameters.userId)
    .send(payload).expect(ok)
  const paymentId = response.body.wallet.paymentId

  const androidPromotion = await t.context.createPromotion('ugp', 'android', true)

  response = await t.context.ledger.get('/v5/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(ok)
  let promotion = response.body

  t.is(promotion.promotionId, androidPromotion.id)
  t.is(promotion.type, 'android')

  // Cannot claim from ads geo
  await t.context.ledger
    .put(`/v3/grants/${paymentId}`)
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'US')
    .send({ promotionId: androidPromotion.id })
    .expect(400)

  await t.context.ledger
    .get(`/v4/captchas/${paymentId}`)
    .set('brave-product', 'brave-core')
    .expect(ok)

  const { captcha } = await wallets.findOne({ paymentId })

  // Cannot claim android grant with desktop solution
  await t.context.ledger
    .put(`/v4/grants/${paymentId}`)
    .send({
      promotionId: androidPromotion.id,
      captchaResponse: {
        x: captcha.x,
        y: captcha.y
      }
    })
    .expect(404)

  await wallets.update({
    paymentId
  }, {
    $set: {
      nonce: BAT_CAPTCHA_BRAVE_NONCE
    }
  })

  await t.context.ledger
    .put(`/v3/grants/${paymentId}`)
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'JA')
    .send({ promotionId: androidPromotion.id })
    .expect(200)

  await t.context.ledger.get('/v5/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(404)

  response = await t.context.ledger.get(`/v2/wallet/${paymentId}?refresh=true`)
    .expect(200)
  const walletInfo = response.body
  t.is(walletInfo.grants.length, 1)
  t.true(new BigNumber(walletInfo.balance).equals('15.0'))
})

test('grants: redeem promotions', async t => {
  const ledgerDB = await connectToDb('ledger')
  const wallets = ledgerDB.collection('wallets')

  const personaId = uuidV4().toLowerCase()

  var response = await t.context.ledger.get('/v2/registrar/persona').expect(ok)
  const personaCredential = new anonize.Credential(personaId, response.body.registrarVK)

  const keypair = tweetnacl.sign.keyPair()
  const body = {
    label: uuidV4().toLowerCase(),
    currency: 'BAT',
    publicKey: uint8tohex(keypair.publicKey)
  }
  var octets = JSON.stringify(body)
  var headers = {
    digest: 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64')
  }

  headers.signature = sign({
    headers: headers,
    keyId: 'primary',
    secretKey: uint8tohex(keypair.secretKey)
  }, { algorithm: 'ed25519' })

  var payload = { requestType: 'httpSignature',
    request: {
      body: body,
      headers: headers,
      octets: octets
    },
    proof: personaCredential.request()
  }
  response = await t.context.ledger.post('/v2/registrar/persona/' + personaCredential.parameters.userId)
    .send(payload).expect(ok)
  const paymentId = response.body.wallet.paymentId

  const androidPromotion = await t.context.createPromotion('ugp', 'android', true)

  await wallets.update({
    paymentId
  }, {
    $set: {
      nonce: BAT_CAPTCHA_BRAVE_NONCE
    }
  })

  await t.context.ledger
    .put(`/v3/grants/${paymentId}`)
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'JA')
    .send({ promotionId: androidPromotion.id })
    .expect(200)

  response = await t.context.ledger.get(`/v2/wallet/${paymentId}?refresh=true&amount=15.0&altcurrency=BAT`)
    .expect(200)
  const { unsignedTx } = response.body
  t.is(response.body.grants.length, 1)
  t.true(new BigNumber(response.body.balance).equals('15.0'))

  const viewingId = uuidV4().toLowerCase()
  const surveyorId = (await createSurveyor({ rate: 1, votes: 12 })).body.surveyorId

  const createPayload = setupCreatePayload({
    viewingId,
    surveyorId,
    keypair
  })

  const redeemPayload = createPayload(unsignedTx)

  do { // Contribution surveyor creation is handled asynchonously, this API will return 503 until ready
    if (response.status === 503) {
      await timeout(response.headers['retry-after'] * 1000)
    }
    response = await t.context.ledger
      .put('/v2/wallet/' + paymentId)
      .send(redeemPayload)
  } while (response.status === 503)
  const err = ok(response)
  if (err) throw err

  response = await t.context.ledger.get(`/v2/wallet/${paymentId}?refresh=true`)
    .expect(200)
  const walletInfo = response.body
  t.is(walletInfo.grants, undefined)
  t.true(new BigNumber(walletInfo.balance).equals('0.0'))
})

test('grants: add expired grant and make sure it does not add to wallet', async t => {
  let body
  const url = '/v4/grants'
  await agents.ledger.global.post(url).send(expired).expect(ok)

  const personaId = uuidV4().toLowerCase()

  var response = await agents.ledger.global.get('/v2/registrar/persona').expect(ok)
  const personaCredential = new anonize.Credential(personaId, response.body.registrarVK)

  const keypair = tweetnacl.sign.keyPair()
  body = {
    label: uuidV4().toLowerCase(),
    currency: 'BAT',
    publicKey: uint8tohex(keypair.publicKey)
  }
  var octets = JSON.stringify(body)
  var headers = {
    digest: 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64')
  }

  headers.signature = sign({
    headers: headers,
    keyId: 'primary',
    secretKey: uint8tohex(keypair.secretKey)
  }, { algorithm: 'ed25519' })

  var payload = { requestType: 'httpSignature',
    request: {
      body: body,
      headers: headers,
      octets: octets
    },
    proof: personaCredential.request()
  }
  response = await agents.ledger.global.post('/v2/registrar/persona/' + personaCredential.parameters.userId)
    .send(payload).expect(ok)
  const paymentId = response.body.wallet.paymentId

  // get available grant
  await agents.ledger.global
    .get('/v4/grants')
    .expect(ok)

  const ledgerDB = await connectToDb('ledger')
  const wallets = ledgerDB.collection('wallets')
  const resolved = await resolveCaptcha(wallets, {
    paymentId,
    promotionId
  })

  t.is(resolved.currentBalance, '0.0000')
})

test('attestation returns a random value for the same paymentId', async (t) => {
  const paymentId = 'e5d074c7-199f-4a5e-9a81-3460aef128d0'
  const url = `/v1/attestations/${paymentId}`

  const { body } = await agents.ledger.global
    .get(url)
    .expect(ok)

  t.true(_.isString(body.nonce))

  const {
    body: second
  } = await agents.ledger.global
    .get(url)
    .expect(ok)

  t.not(body.nonce, second.nonce)
})

test('claim grants with attestations', async (t) => {
  let body, wallet
  const url = '/v4/grants'
  const adPromotionId = 'bad49132-de38-47e7-8003-986af88eeb1c'
  const promotionId = '902e7e4d-c2de-4d5d-aaa3-ee8fee69f7f3'

  const adGrants = { 'promotions': [{ 'promotionId': adPromotionId, 'priority': 0, 'active': true, 'minimumReconcileTimestamp': 1550102400000, 'protocolVersion': 4, 'type': 'ads' }], 'grants': ['eyJhbGciOiJFZERTQSIsImtpZCI6IiJ9.eyJhbHRjdXJyZW5jeSI6IkJBVCIsImdyYW50SWQiOiI1YTdlOTZhOC0wOWE5LTQ1OGUtODNjYS1jMjYzYTFjNTBiZjUiLCJwcm9iaSI6IjEwMDAwMDAwMDAwMDAwMDAwMDAiLCJwcm9tb3Rpb25JZCI6ImJhZDQ5MTMyLWRlMzgtNDdlNy04MDAzLTk4NmFmODhlZWIxYyIsIm1hdHVyaXR5VGltZSI6MTU1NjEyMjMyOCwiZXhwaXJ5VGltZSI6MjE2MDkyNTkyOCwidHlwZSI6ImFkcyIsInByb3ZpZGVySWQiOiI2ZTM4MjRmNi05ZWVjLTRmNTYtOTcxOS04YWRkYWZmZTNmZjEifQ.kcBlRGoOFylPOP3cnCaEhNuePvvOQ6z5a1fNogA6rELoHo_i28elzNLZ8X2VoHcD8LMkcgijgviCOypu3_0AAg'] }

  const grants = {
    'grants': [ 'eyJhbGciOiJFZERTQSIsImtpZCI6IiJ9.eyJhbHRjdXJyZW5jeSI6IkJBVCIsImdyYW50SWQiOiJhNDMyNjg1My04NzVlLTQ3MDgtYjhkNS00M2IwNGMwM2ZmZTgiLCJwcm9iaSI6IjMwMDAwMDAwMDAwMDAwMDAwMDAwIiwicHJvbW90aW9uSWQiOiI5MDJlN2U0ZC1jMmRlLTRkNWQtYWFhMy1lZThmZWU2OWY3ZjMiLCJtYXR1cml0eVRpbWUiOjE1MTUwMjkzNTMsImV4cGlyeVRpbWUiOjE4MzAzODkzNTN9.8M5dpr_rdyCURd7KBc4GYaFDsiDEyutVqG-mj1QRk7BCiihianvhiqYeEnxMf-F4OU0wWyCN5qKDTxeqait_BQ' ],
    'promotions': [{
      'protocolVersion': 4,
      'type': 'android',
      'active': true,
      'priority': 0,
      promotionId,
      minimumReconcileTimestamp: 1526941400000
    }]
  }
  await agents.ledger.global.post(url).send(adGrants).expect(ok)
  await agents.ledger.global.post(url).send(grants).expect(ok)

  let paymentId = '73b8e65a-2810-4c21-a3f6-74969ba7eaf3'
  const providerId = '6e3824f6-9eec-4f56-9719-8addaffe3ff1'

  const ledgerDB = await connectToDb('ledger')
  const wallets = ledgerDB.collection('wallets')
  const personaId = uuidV4().toLowerCase()

  var response = await agents.ledger.global.get('/v2/registrar/persona').expect(ok)
  const personaCredential = new anonize.Credential(personaId, response.body.registrarVK)

  const keypair = tweetnacl.sign.keyPair()
  body = {
    label: uuidV4().toLowerCase(),
    currency: 'BAT',
    publicKey: uint8tohex(keypair.publicKey)
  }
  var octets = JSON.stringify(body)
  var headers = {
    digest: 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64')
  }

  headers.signature = sign({
    headers: headers,
    keyId: 'primary',
    secretKey: uint8tohex(keypair.secretKey)
  }, { algorithm: 'ed25519' })

  var payload = { requestType: 'httpSignature',
    request: {
      body: body,
      headers: headers,
      octets: octets
    },
    proof: personaCredential.request()
  }
  response = await agents.ledger.global.post('/v2/registrar/persona/' + personaCredential.parameters.userId)
    .send(payload).expect(ok)
  const wrongPaymentId = response.body.wallet.paymentId

  await agents.ledger.global
    .get('/v3/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN + 'bad')
    .expect(422)

  await agents.ledger.global
    .get('/v3/grants')
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(404)

  // ensure desktop can't get android grants
  await agents.ledger.global
    .get('/v4/grants')
    .expect(404)

  // get available grant doesn't show others ad grants
  ;({ body } = await agents.ledger.global
    .get('/v5/grants')
    .query({ paymentId: wrongPaymentId, bypassCooldown })
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .expect(ok))

  // try to claim ad grant
  let attestationURL = `/v1/attestations/${wrongPaymentId}`
  response = await agents.ledger.global
    .get(attestationURL)
    .expect(ok)

  let nonce = Buffer.from(response.body.nonce).toString('base64')

  wallet = await wallets.findOne({ paymentId: wrongPaymentId })

  t.not(wallet.nonce, undefined, 'a random nonce was set')
  t.is(wallet.nonce, nonce, 'a random nonce was set on the wallet object')
  t.is(wallet.cohort, undefined, 'wallet has not been assigned a cohort')

  await wallets.update({
    paymentId: wrongPaymentId
  }, {
    $set: {
      nonce: BAT_CAPTCHA_BRAVE_NONCE
    }
  })

  // claim grant should fail (wrong providerId)
  await agents.ledger.global
    .put(`/v3/grants/${wrongPaymentId}`)
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'US')
    .send({ promotionId: adPromotionId })
    .expect(410)

  await wallets.update({ paymentId: wrongPaymentId }, {
    $set: {
      'paymentId': paymentId,
      'addresses': {
        'BAT': '0x96394730f1B583B4Bb23eA1B8c9CF84c306C72f1',
        'BTC': 'mz6GHnUCTBPcy6gAZkhfZeJnTrKtSGP4xE',
        'CARD_ID': providerId,
        'ETH': '0x96394730f1B583B4Bb23eA1B8c9CF84c306C72f1',
        'LTC': 'myjzYWGTmsnkzVGUz8MWjHh25c5NWJ3uPW'
      },
      'altcurrency': 'BAT',
      'httpSigningPubKey': 'c8b4ad40ad2c38367edbc9509302f2bcc851bdb68a1cded9932e30667d7796fc',
      'provider': 'uphold',
      'providerId': providerId
    }
  })

  // get available grant - check for ad precidence
  const { body: outsideBoundsBody } = await agents.ledger.global
    .get('/v5/grants')
    .query({ paymentId, bypassCooldown })
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'JA')
    .expect(ok)

  // get available grant - check available in ads region (US)
  ;({ body } = await agents.ledger.global
    .get('/v5/grants')
    .query({ paymentId, bypassCooldown })
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'US')
    .expect(ok))

  t.deepEqual(outsideBoundsBody, body, 'ads are available outside of countries')
  t.is(body.type, 'ads')

  response = await agents.ledger.global
    .get(`/v1/attestations/${paymentId}`)
    .expect(ok)

  nonce = Buffer.from(response.body.nonce).toString('base64')

  wallet = await wallets.findOne({ paymentId })

  t.not(wallet.nonce, undefined, 'a random nonce was set')
  t.is(wallet.nonce, nonce, 'a random nonce was set on the wallet object')

  await wallets.update({
    paymentId
  }, {
    $set: {
      nonce: BAT_CAPTCHA_BRAVE_NONCE
    }
  })

  // claim ad grant - works in ads region
  response = await agents.ledger.global
    .put(`/v3/grants/${paymentId}`)
    .set({
      'Fastly-GeoIP-CountryCode': 'US',
      'Safetynet-Token': BAT_CAPTCHA_BRAVE_TOKEN
    })
    .send({ promotionId: adPromotionId })
    .expect(ok)

  wallet = await wallets.findOne({ paymentId })
  t.is(wallet.nonce, undefined, 'nonce was unset from wallet object after use')
  t.is(wallet.cohort, 'safetynet', 'wallet was assigned to safetynet cohort')

  await checkWalletState(response.body, '1.0000', [{
    type: 'ads',
    altcurrency: 'BAT',
    expiryTime: 2160925928,
    probi: '1000000000000000000'
  }])

  response = await agents.ledger.global
    .get(`/v1/attestations/${paymentId}`)
    .expect(ok)

  nonce = Buffer.from(response.body.nonce).toString('base64')

  wallet = await wallets.findOne({ paymentId })

  t.not(wallet.nonce, undefined, 'a random nonce was set')
  t.is(wallet.nonce, nonce, 'a random nonce was set on the wallet object')

  await wallets.update({
    paymentId
  }, {
    $set: {
      nonce: BAT_CAPTCHA_BRAVE_NONCE
    }
  })

  // get available grant - android ugp grant not available in ads region (US)
  await agents.ledger.global
    .get('/v5/grants')
    .query({ paymentId, bypassCooldown })
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'US')
    .expect(404)

  // get available grant - android ugp grant is available in non-ads region (JA)
  ;({ body } = await agents.ledger.global
    .get('/v5/grants')
    .query({ paymentId, bypassCooldown })
    .set('Safetynet-Token', BAT_CAPTCHA_BRAVE_TOKEN)
    .set('Fastly-GeoIP-CountryCode', 'JA')
    .expect(ok))

  t.is(body.type, 'android')

  // claim ugp grant - fails in ads region
  await agents.ledger.global
    .put(`/v3/grants/${paymentId}`)
    .set({
      'Safetynet-Token': BAT_CAPTCHA_BRAVE_TOKEN,
      'Fastly-GeoIP-CountryCode': 'US'
    })
    .send({ promotionId })
    .expect(400)

  // claim ugp grant - succeeds in non-ads region
  response = await agents.ledger.global
    .put(`/v3/grants/${paymentId}`)
    .set({
      'Safetynet-Token': BAT_CAPTCHA_BRAVE_TOKEN,
      'Fastly-GeoIP-CountryCode': 'JA'
    })
    .send({ promotionId })
    .expect(ok)

  await checkWalletState(response.body, '31.0000', [{
    type: 'ads',
    altcurrency: 'BAT',
    expiryTime: 2160925928,
    probi: '1000000000000000000'
  }, {
    type: 'android',
    altcurrency: 'BAT',
    expiryTime: 1830389353,
    probi: '30000000000000000000'
  }])

  async function checkWalletState (body, expectedTotalBalance, expectedGrants, expectedCardBalance = '0') {
    const donateAmt = new BigNumber(body.probi).dividedBy('1e18').toNumber()
    const desired = donateAmt.toString()
    let response
    do {
      response = await agents.ledger.global
        .get(`/v2/wallet/${paymentId}?refresh=true&amount=${desired}&altcurrency=BAT`)
      if (response.status === 503) await timeout(response.headers['retry-after'] * 1000)
    } while (response.status === 503)
    var err = ok(response)
    if (err) throw err
    t.is(response.body.balance, expectedTotalBalance)
    t.is(response.body.cardBalance, expectedCardBalance)
    t.deepEqual(response.body.grants, expectedGrants, 'relevant grant information is sent back')
    t.deepEqual(response.body.grants, await balanceGrants(paymentId), 'balance has the same info')
  }
})

test('protocolVersion 4 does not send back ads when none are available', async (t) => {
  let body
  let response
  let octets
  let headers
  let balance = 0

  const url = '/v4/grants'
  const promotionId = 'cf0075c8-3902-46c0-be77-b8d8f7d83755'
  const adPromotionId = 'bad49132-de38-47e7-8003-986af88eeb1c'
  const personaId = uuidV4().toLowerCase()

  const ledgerDB = await connectToDb('ledger')
  const wallets = ledgerDB.collection('wallets')

  response = await agents.ledger.global.get('/v2/registrar/persona').expect(ok)
  const personaCredential = new anonize.Credential(personaId, response.body.registrarVK)

  const keypair = tweetnacl.sign.keyPair()
  body = {
    label: uuidV4().toLowerCase(),
    currency: 'BAT',
    publicKey: uint8tohex(keypair.publicKey)
  }
  octets = JSON.stringify(body)
  headers = {
    digest: 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64')
  }

  headers.signature = sign({
    headers: headers,
    keyId: 'primary',
    secretKey: uint8tohex(keypair.secretKey)
  }, { algorithm: 'ed25519' })

  var payload = { requestType: 'httpSignature',
    request: {
      body: body,
      headers: headers,
      octets: octets
    },
    proof: personaCredential.request()
  }
  response = await agents.ledger.global.post('/v2/registrar/persona/' + personaCredential.parameters.userId)
    .send(payload).expect(ok)
  let paymentId = response.body.wallet.paymentId

  const grants = { 'grants': ['eyJhbGciOiJFZERTQSIsImtpZCI6IiJ9.eyJhbHRjdXJyZW5jeSI6IkJBVCIsImdyYW50SWQiOiJiNDBkYjA4YS0yZmExLTQwOWUtOWVmYy1mYzJkOTU1NTQ2YTUiLCJwcm9iaSI6IjEwMDAwMDAwMDAwMDAwMDAwMDAiLCJwcm9tb3Rpb25JZCI6ImNmMDA3NWM4LTM5MDItNDZjMC1iZTc3LWI4ZDhmN2Q4Mzc1NSIsIm1hdHVyaXR5VGltZSI6MTU0NjMwMDgwMCwiZXhwaXJ5VGltZSI6MTY3MjM1ODQwMCwidHlwZSI6InVncCJ9.0CsPvRtWhhxI3GG95ClkY3aontogb4vwpdp5D39iH9DDJkRoh7FADMEBAWJ44SwXX-XZhb2qgWD-cAP3Ua5gBg'], 'promotions': [{ promotionId, 'priority': 0, 'active': true, 'minimumReconcileTimestamp': 1546300800000, 'protocolVersion': 4, 'type': 'ugp' }] }

  const adGrants = { 'promotions': [{ 'promotionId': adPromotionId, 'priority': 0, 'active': true, 'minimumReconcileTimestamp': 1550102400000, 'protocolVersion': 4, 'type': 'ads' }], 'grants': ['eyJhbGciOiJFZERTQSIsImtpZCI6IiJ9.eyJhbHRjdXJyZW5jeSI6IkJBVCIsImdyYW50SWQiOiI1YTdlOTZhOC0wOWE5LTQ1OGUtODNjYS1jMjYzYTFjNTBiZjUiLCJwcm9iaSI6IjEwMDAwMDAwMDAwMDAwMDAwMDAiLCJwcm9tb3Rpb25JZCI6ImJhZDQ5MTMyLWRlMzgtNDdlNy04MDAzLTk4NmFmODhlZWIxYyIsIm1hdHVyaXR5VGltZSI6MTU1NjEyMjMyOCwiZXhwaXJ5VGltZSI6MjE2MDkyNTkyOCwidHlwZSI6ImFkcyIsInByb3ZpZGVySWQiOiI2ZTM4MjRmNi05ZWVjLTRmNTYtOTcxOS04YWRkYWZmZTNmZjEifQ.kcBlRGoOFylPOP3cnCaEhNuePvvOQ6z5a1fNogA6rELoHo_i28elzNLZ8X2VoHcD8LMkcgijgviCOypu3_0AAg'] }

  await agents.ledger.global.post(url).send(grants).expect(ok)
  await agents.ledger.global.post(url).send(adGrants).expect(ok)

  // get available grant
  await agents.ledger.global
    .get('/v4/grants')
    .query({ paymentId })
    .expect(404)

  const {
    body: {
      grants: promotions
    }
  } = await agents.ledger.global
    .get(`/v4/grants`)
    .query({ paymentId, bypassCooldown })
    .expect(ok)
  t.is(promotions.length, 1, 'only one promotion should be sent back')

  const resolved = await resolveCaptcha(wallets, {
    paymentId,
    promotionId,
    balance
  })
  t.is(resolved.balance.toString(), '1')
  t.deepEqual(resolved.grants, [{
    type: 'ugp',
    altcurrency: 'BAT',
    expiryTime: 1672358400,
    probi: '1000000000000000000'
  }], 'relevant grant information is sent back')
  t.deepEqual(resolved.grants, resolved.balanceGrants, 'balance has the same info')
  await t.throwsAsync(async () => {
    await resolveCaptcha(wallets, {
      paymentId,
      promotionId: adPromotionId,
      balance: 1
    })
  })
})

test('protocolVersion 4 can claim both ads and ugp grants', async (t) => {
  let body
  let response
  let octets
  let headers
  let balance = 0

  const url = '/v4/grants'
  const promotionId = 'cf0075c8-3902-46c0-be77-b8d8f7d83755'
  const adPromotionId = 'bad49132-de38-47e7-8003-986af88eeb1c'
  const providerId = '6e3824f6-9eec-4f56-9719-8addaffe3ff1'
  const personaId = uuidV4().toLowerCase()

  const ledgerDB = await connectToDb('ledger')
  const wallets = ledgerDB.collection('wallets')

  response = await agents.ledger.global.get('/v2/registrar/persona').expect(ok)
  const personaCredential = new anonize.Credential(personaId, response.body.registrarVK)

  const keypair = tweetnacl.sign.keyPair()
  body = {
    label: uuidV4().toLowerCase(),
    currency: 'BAT',
    publicKey: uint8tohex(keypair.publicKey)
  }
  octets = JSON.stringify(body)
  headers = {
    digest: 'SHA-256=' + crypto.createHash('sha256').update(octets).digest('base64')
  }

  headers.signature = sign({
    headers: headers,
    keyId: 'primary',
    secretKey: uint8tohex(keypair.secretKey)
  }, { algorithm: 'ed25519' })

  var payload = { requestType: 'httpSignature',
    request: {
      body: body,
      headers: headers,
      octets: octets
    },
    proof: personaCredential.request()
  }
  response = await agents.ledger.global.post('/v2/registrar/persona/' + personaCredential.parameters.userId)
    .send(payload).expect(ok)
  let paymentId = response.body.wallet.paymentId

  const nextPaymentId = '73b8e65a-2810-4c21-a3f6-74969ba7eaf3'

  await wallets.update({
    paymentId
  }, {
    $set: {
      'paymentId': nextPaymentId,
      'addresses': {
        'BAT': '0x96394730f1B583B4Bb23eA1B8c9CF84c306C72f1',
        'BTC': 'mz6GHnUCTBPcy6gAZkhfZeJnTrKtSGP4xE',
        'CARD_ID': providerId,
        'ETH': '0x96394730f1B583B4Bb23eA1B8c9CF84c306C72f1',
        'LTC': 'myjzYWGTmsnkzVGUz8MWjHh25c5NWJ3uPW'
      },
      'altcurrency': 'BAT',
      'httpSigningPubKey': 'c8b4ad40ad2c38367edbc9509302f2bcc851bdb68a1cded9932e30667d7796fc',
      'provider': 'uphold',
      'providerId': providerId
    }
  })
  paymentId = nextPaymentId

  const grants = { 'grants': ['eyJhbGciOiJFZERTQSIsImtpZCI6IiJ9.eyJhbHRjdXJyZW5jeSI6IkJBVCIsImdyYW50SWQiOiJiNDBkYjA4YS0yZmExLTQwOWUtOWVmYy1mYzJkOTU1NTQ2YTUiLCJwcm9iaSI6IjEwMDAwMDAwMDAwMDAwMDAwMDAiLCJwcm9tb3Rpb25JZCI6ImNmMDA3NWM4LTM5MDItNDZjMC1iZTc3LWI4ZDhmN2Q4Mzc1NSIsIm1hdHVyaXR5VGltZSI6MTU0NjMwMDgwMCwiZXhwaXJ5VGltZSI6MTY3MjM1ODQwMCwidHlwZSI6InVncCJ9.0CsPvRtWhhxI3GG95ClkY3aontogb4vwpdp5D39iH9DDJkRoh7FADMEBAWJ44SwXX-XZhb2qgWD-cAP3Ua5gBg'], 'promotions': [{ 'promotionId': 'cf0075c8-3902-46c0-be77-b8d8f7d83755', 'priority': 0, 'active': true, 'minimumReconcileTimestamp': 1546300800000, 'protocolVersion': 4, 'type': 'ugp' }] }

  const adGrants = { 'promotions': [{ 'promotionId': adPromotionId, 'priority': 0, 'active': true, 'minimumReconcileTimestamp': 1550102400000, 'protocolVersion': 4, 'type': 'ads' }], 'grants': ['eyJhbGciOiJFZERTQSIsImtpZCI6IiJ9.eyJhbHRjdXJyZW5jeSI6IkJBVCIsImdyYW50SWQiOiI1YTdlOTZhOC0wOWE5LTQ1OGUtODNjYS1jMjYzYTFjNTBiZjUiLCJwcm9iaSI6IjEwMDAwMDAwMDAwMDAwMDAwMDAiLCJwcm9tb3Rpb25JZCI6ImJhZDQ5MTMyLWRlMzgtNDdlNy04MDAzLTk4NmFmODhlZWIxYyIsIm1hdHVyaXR5VGltZSI6MTU1NjEyMjMyOCwiZXhwaXJ5VGltZSI6MjE2MDkyNTkyOCwidHlwZSI6ImFkcyIsInByb3ZpZGVySWQiOiI2ZTM4MjRmNi05ZWVjLTRmNTYtOTcxOS04YWRkYWZmZTNmZjEifQ.kcBlRGoOFylPOP3cnCaEhNuePvvOQ6z5a1fNogA6rELoHo_i28elzNLZ8X2VoHcD8LMkcgijgviCOypu3_0AAg'] }

  await agents.ledger.global.post(url).send(grants).expect(ok)
  await agents.ledger.global.post(url).send(adGrants).expect(ok)

  // get available grant
  await agents.ledger.global
    .get('/v4/grants')
    .query({ paymentId })
    .expect(404)
  const {
    body: {
      grants: promotions
    }
  } = await agents.ledger.global
    .get(`/v4/grants`)
    .query({ paymentId, bypassCooldown })
    .expect(ok)
  t.is(promotions.length, 2, '2 promotions should be sent back')

  const steps = {
    [promotionId]: '1',
    [adPromotionId]: '2'
  }
  let resolved
  for (let promotionId in steps) {
    const finalBalance = steps[promotionId]
    resolved = await resolveCaptcha(wallets, {
      paymentId,
      promotionId,
      balance
    })
    balance = resolved.balance
    t.is(balance.toString(), finalBalance)
  }
  t.deepEqual(resolved.grants, [{
    type: 'ugp',
    altcurrency: 'BAT',
    expiryTime: 1672358400,
    probi: '1000000000000000000'
  }, {
    altcurrency: 'BAT',
    expiryTime: 2160925928,
    probi: '1000000000000000000',
    type: 'ads'
  }], 'relevant grant information is sent back')
  t.deepEqual(resolved.grants, resolved.balanceGrants, 'balance has the same info')
})

async function resolveCaptcha (wallets, {
  version = 2,
  paymentId,
  promotionId,
  balance = 0
}) {
  let response

  await agents.ledger.global
    .get(`/v4/captchas/${paymentId}`)
    .set('brave-product', 'brave-core')
    .expect(ok)

  const {
    captcha
  } = await wallets.findOne({ paymentId })

  // request grant
  response = await agents.ledger.global
    .put(`/v${version}/grants/${paymentId}`)
    .send({
      promotionId,
      captchaResponse: {
        x: captcha.x,
        y: captcha.y
      }
    })
    .expect(ok)

  const donateAmt = new BigNumber(response.body.probi).dividedBy('1e18').toNumber()
  const desired = donateAmt.toString()
  const total = (new BigNumber(balance)).plus(desired)

  do {
    response = await agents.ledger.global
      .get(`/v2/wallet/${paymentId}?refresh=true&amount=${total}&altcurrency=BAT`)
    if (response.status === 503) await timeout(response.headers['retry-after'] * 1000)
  } while (response.status === 503)
  var err = ok(response)
  if (err) throw err
  const { grants } = response.body
  // skip the 5 min caching
  return {
    currentBalance: response.body.balance,
    balance: total,
    grants,
    balanceGrants: await balanceGrants(paymentId)
  }
}

async function balanceGrants (paymentId) {
  await agents.balance.global
    .del(`/v2/wallet/${paymentId}/balance`)
    .expect(ok)
  const {
    body: {
      grants: balanceGrants
    }
  } = await agents.balance.global
    .get(`/v2/wallet/${paymentId}/balance`)
    .expect(ok)
  return balanceGrants
}
