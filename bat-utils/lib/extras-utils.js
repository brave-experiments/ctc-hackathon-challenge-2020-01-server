const getPublisherProps = require('bat-publisher').getPublisherProps
// this can be abstracted elsewhere as soon as we finish #274
const BigNumber = require('bignumber.js')
const dotenv = require('dotenv')
const _ = require('underscore')
dotenv.config()
BigNumber.config({
  EXPONENTIAL_AT: 28,
  DECIMAL_PLACES: 18
})
const PROBI_FACTOR = 1e18

module.exports = {
  PROBI_FACTOR,
  backfillDateRange,
  changeMonth,
  isUUID,
  surveyorChoices,
  timeout,
  extractJws,
  utf8ify,
  mungeEnv,
  uint8tohex,
  createdTimestamp,
  documentOlderThan,
  isYoutubeChannelId,
  normalizeChannel,
  justDate,
  BigNumber
}

const DAY_MS = 60 * 60 * 24 * 1000
// courtesy of https://stackoverflow.com/questions/33289726/combination-of-async-function-await-settimeout#33292942
function timeout (msec) {
  return new Promise((resolve) => setTimeout(resolve, msec))
}

function backfillDateRange ({
  start,
  until
}) {
  if (until) {
    return {
      start: new Date(start),
      until: new Date(until)
    }
  }
  return {
    start,
    until: changeMonth(start)
  }
}

function changeMonth (date, months = 1) {
  const DAY = 1000 * 60 * 60 * 24
  let d = new Date(date)
  const currentMonth = getCurrentMonth(d)
  const delta = months > 0 ? 1 : -1
  const targetMonth = currentMonth + delta
  while (getCurrentMonth(d) !== targetMonth) {
    d = new Date(+d + (delta * DAY))
  }
  return d

  function getCurrentMonth (d) {
    return (12 * d.getYear()) + d.getMonth()
  }
}

function extractJws (jws) {
  const payload = jws.split('.')[1]
  const buf = Buffer.from(payload, 'base64')
  return JSON.parse(buf.toString('utf8'))
}

// courtesy of https://stackoverflow.com/questions/31649362/json-stringify-and-unicode-characters#31652607
function utf8ify (data) {
  if (typeof data !== 'string') data = JSON.stringify(data, null, 2)

  return data.replace(/[\u007F-\uFFFF]/g, (c) => {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).substr(-4)
  })
}

function documentOlderThan (olderThanDays, anchorTime, _id) {
  return createdTimestamp(_id) < (anchorTime - (DAY_MS * olderThanDays))
}

function createdTimestamp (id) {
  return new Date(parseInt(id.toHexString().substring(0, 8), 16) * 1000).getTime()
}

function uint8tohex (arr) {
  return [].slice.call(arr).map((b) => ('00' + b.toString(16)).substr(-2)).join('')
}

function isYoutubeChannelId (channelId) {
  const yt = new RegExp(/^UC[0-9A-Za-z_-]{21}[AQgw]$/i)
  return yt.test(channelId)
}

function normalizeChannel (channel) {
  const props = getPublisherProps(channel)
  if (props.providerName) {
    if (props.providerName === 'twitch') {
      return `${props.providerName}#author:${props.providerValue}`
    } else if (props.providerName === 'youtube') {
      if (!isYoutubeChannelId(props.providerValue)) {
        return `${props.providerName}#user:${props.providerValue}`
      }
    }
  }
  return channel
}

function justDate (date) {
  return (new Date(date)).toISOString().split('T')[0]
}

function surveyorChoices (ratio) {
  const table = [
    [3, 5, 7, 10, 20],
    [4, 6, 9, 12, 25],
    [5, 8, 11, 17, 35],
    [6, 10, 14, 20, 40],
    [9, 12, 20, 35, 50],
    [15, 25, 35, 50, 100],
    [20, 35, 50, 85],
    [30, 50, 70, 100]
  ]
  const priceIncrements = [1, 0.8, 0.6, 0.5, 0.35, 0.2, 0.15, 0.1]
  let index = _.findIndex(priceIncrements, (increment) => {
    return increment <= ratio
  })
  if (index < 0) {
    index = priceIncrements.length - 1
  }
  return table[index]
}

function isUUID (string) {
  var uuidRegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return uuidRegExp.test(string)
}

async function mungeEnv (keys, handler) {
  const cachedEnv = _.toArray(keys).map((key) => process.env[key])
  await handler(setEnvs)
  setEnvs(cachedEnv)

  function setEnvs (values = []) {
    _.toArray(values).forEach((value, index) => {
      const key = keys[index]
      if (_.isString(value)) {
        process.env[key] = value
      } else {
        delete process.env[key]
      }
    })
  }
}
