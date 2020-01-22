const Joi = require('@hapi/joi')
const boom = require('boom')
const bson = require('bson')
const underscore = require('underscore')
const SDebug = require('sdebug')
const uuidV4 = require('uuid/v4')

const utils = require('bat-utils')
const braveHapi = utils.extras.hapi
// const braveJoi = utils.extras.joi

const debug = new SDebug('igbgd')

const v1 = {}

const joikeys = {
  image: {
    data: Joi.string().base64({ paddingRequired: false }).description('base64 encoding'),
    format: Joi.string().regex(/^png$/).default('png')
  },
  limit: Joi.number().positive().optional().description('the maximum number of entries to return'),
  location: {
    longitude: Joi.number().precision(8).min(-180).max(180).required().description('east-west'),
    latitude: Joi.number().precision(8).min(-90).max(90).required().description('north-south'),
    elevation: Joi.number().optional().description('in meters')
  }
}
joikeys.entry = {
  publicID: Joi.string().guid().required().description('public identity of the entry'),
  privateID: Joi.string().guid().required().description('private identity of the entry'),
  category: Joi.string().regex(/^green-iguana$/).required(),
  location: Joi.object().keys(joikeys.location).required(),
  image: Joi.object().keys(joikeys.image).required(),
  description: Joi.string().optional()
}

/*
  GET /v1/entry/{shape}/{radius}
*/

v1.getEntries = {
  handler: (runtime) => {
    return async (request, h) => {
      const radius = request.params.radius
      const params = request.query
      const query = {
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [ params.longitude, params.latitude ] },
            $minDistance: 0,
            $maxDistance: radius
          }
        }
      }
      const entries = runtime.database.get('entries', debug)

      let limit = parseInt(params.limit, 10)
      if (isNaN(limit) || (limit > 512)) limit = 512

      console.log('!!! query=' + JSON.stringify(query, null, 2))
      const matches = await entries.find(query, { limit: limit })
      console.log('!!! matches=' + JSON.stringify(matches, null, 2))

      const keys = underscore.keys(underscore.omit(joikeys.entry, [ 'privateID' ]))
      const result = []
      matches.forEach(match => {
        const entry = underscore.pick(match, keys)
        const coordinates = match.location.coordinates

        entry.location = { longitude: coordinates[0], latitude: coordinates[1] }
        if (coordinates.length > 2) entry.location.elevation = coordinates[2]
        result.push(entry)
      })

      return result
    }
  },

  description: 'Get entries within a particular geo-fence',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      shape: Joi.string().regex(/^circle$/).required(),
      radius: Joi.number().positive().description('in meters')
    }),
    query: Joi.object().keys(underscore.extend({ limit: joikeys.limit }, joikeys.location))
  },

  response: {
    schema: Joi.array().items(Joi.object().keys(underscore.omit(joikeys.entry, [ 'privateID' ])))
  }
}

/*
  POST /v1/entry
 */

v1.postEntry = {
  handler: (runtime) => {
    return async (request, h) => {
      const payload = request.payload
      const privateID = payload.privateID
      const entries = runtime.database.get('entries', debug)

      let publicID = uuidV4().toLowerCase()
      let result = await entries.findOne({ privateID: privateID })
      if (result) throw boom.badData('private identity entry already exists: ' + privateID)

      if (payload.image.format === undefined) payload.image.format = 'png'
      try {
        await entries.insert(underscore.extend(underscore.pick(payload, [ 'privateID', 'category', 'image', 'description' ]), {
          publicID: publicID,
          location: { type: 'Point', coordinates: [ payload.location.longitude, payload.location.latitude ] },
          timestamp: bson.Timestamp()
        }))
      } catch (ex) {
        runtime.notify(debug, { text: 'entries error: ' + ex.toString() })
        debug('entries error', ex)
        throw boom.badData(ex.toString())
      }

      result = await entries.findOne({ privateID: privateID })
      if (!result) throw boom.badImplementation('database creation failed: ' + privateID)

      return { publicID: publicID }
    }
  },

  auth: {
    strategy: 'simple-scoped-token',
    scope: ['global'],
    mode: 'required'
  },

  description: 'Get entries within a particular geo-fence',
  tags: [ 'api' ],

  validate: {
    payload: Joi.object().keys(underscore.omit(joikeys.entry, [ 'publicID' ]))
  },

  response: {
    schema: Joi.object().keys(underscore.pick(joikeys.entry, [ 'publicID' ]))
  }
}

if ((process.env.NODE_ENV === 'development') && (process.env.GITHUB_FORCE_HTTPS === 'false')) delete v1.postEntry.auth

module.exports.routes = [
  braveHapi.routes.async().path('/v1/entry/{shape}/{radius}').config(v1.getEntries),
  braveHapi.routes.async().post().path('/v1/entry').config(v1.postEntry)
]

module.exports.initialize = async (debug, runtime) => {
  runtime.database.checkIndices(debug, [
    {
      category: runtime.database.get('entries', debug),
      name: 'entries',
      property: 'publicID',
      empty: {
        publicID: '',
        privateID: '',
        category: '',
        description: '',
        timestamp: bson.Timestamp.ZERO
      },
      unique: [ { publicID: 1 }, { privateID: 1 } ],
      others: [ { category: 1 }, { timestamp: 1 } ],
      raw: [ { location: '2dsphere' } ]
    }
  ])

  await runtime.queue.create('wallet-report')
}
