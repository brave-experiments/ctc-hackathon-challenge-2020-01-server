const Joi = require('@hapi/joi')
const boom = require('boom')
const bson = require('bson')
const underscore = require('underscore')
const uuidV4 = require('uuid/v4')

const utils = require('bat-utils')
const braveHapi = utils.extras.hapi

const v1 = {}

const joikeys = {
  category: Joi.string().valid('green-iguana'),
  entry: {
    publicID: Joi.string().guid().required().description('public identity of the entry'),
    privateID: Joi.string().guid().required().description('private identity of the entry'),
    description: Joi.string().optional()
  },
  image: {
    data: Joi.string().base64({ paddingRequired: false }).description('base64 encoding'),
    format: Joi.string().regex(/^png$/).default('png')
  },
  limit: Joi.number().positive().max(25).optional().description('the maximum number of entries to return'),
  location: {
    longitude: Joi.number().precision(8).min(-180).max(180).required().description('east-west'),
    latitude: Joi.number().precision(8).min(-90).max(90).required().description('north-south'),
    elevation: Joi.number().precision(3).optional().description('in meters')
  },
  radius: Joi.number().positive().max(10000).description('in meters'),
  shape: Joi.string().regex(/^circle$/).required()
}
underscore.extend(joikeys.entry, {
  category: joikeys.category.required(),
  location: Joi.object().keys(joikeys.location).required(),
  image: Joi.object().keys(joikeys.image).required()
})

/*
  GET /v1/enties/{shape}/{radius}
*/

v1.getEntries = {
  handler: (runtime) => {
    return async (request, h) => {
      const radius = request.params.radius
      const query = request.query
      const find = {
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [ query.longitude, query.latitude ] },
            $maxDistance: radius
          }
        }
      }

      const category = query.category
      if (category !== undefined) find.category = category

      let limit = parseInt(query.limit, 10)
      if (isNaN(limit) || (limit > 512)) limit = 512

      const debug = braveHapi.debug(module, request)
      const entries = runtime.database.get('entries', debug)

      debug('!!! find=', find)
      const matches = await entries.find(find, { limit: limit })
      debug('!!! matches=', matches)

      const result = []
      matches.forEach(match => {
        result.push(m2e(match))
      })

      return result
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
    params: Joi.object().keys({
      shape: joikeys.shape,
      radius: joikeys.radius
    }),
    query: Joi.object().keys(underscore.extend({
      category: joikeys.category.optional(),
      limit: joikeys.limit
    }, joikeys.location))
  },

  response: {
    schema: Joi.array().items(Joi.object().keys(underscore.omit(joikeys.entry, [ 'privateID' ])))
  }
}

const m2e = (match) => {
  const keys = underscore.keys(underscore.omit(joikeys.entry, [ 'privateID' ]))
  const entry = underscore.pick(match, keys)
  const coordinates = match.location.coordinates

  entry.location = { longitude: coordinates[0], latitude: coordinates[1] }
  if (coordinates.length > 2) entry.location.elevation = coordinates[2]

  return entry
}

/*
  GET /v1/entry/{privateID}
 */

v1.getEntry = {
  handler: (runtime) => {
    return async (request, h) => {
      const privateID = request.params.privateID

      const debug = braveHapi.debug(module, request)
      const entries = runtime.database.get('entries', debug)

      const match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.notFound('no such entry: ' + privateID)

      return m2e(match)
    }
  },

  auth: {
    strategy: 'simple-scoped-token',
    scope: ['global'],
    mode: 'required'
  },

  description: 'Get a particular entry using it\'s creation key',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      privateID: joikeys.entry.privateID
    })
  },

  response: {
    schema: Joi.object().keys(underscore.omit(joikeys.entry, [ 'privateID' ]))
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

      const debug = braveHapi.debug(module, request)
      const entries = runtime.database.get('entries', debug)
      let match = await entries.findOne({ privateID: privateID })
      if (match) throw boom.badData('entry already exists: ' + privateID)

      const publicID = uuidV4().toLowerCase()
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

      match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.badImplementation('database creation failed: ' + privateID)

      return { publicID: publicID }
    }
  },

  auth: {
    strategy: 'simple-scoped-token',
    scope: ['global'],
    mode: 'required'
  },

  description: 'Create an entry',
  tags: [ 'api' ],

  validate: {
    payload: Joi.object().keys(underscore.omit(joikeys.entry, [ 'publicID' ]))
  },

  response: {
    schema: Joi.object().keys(underscore.pick(joikeys.entry, [ 'publicID' ]))
  }
}

if ((process.env.NODE_ENV === 'development') && (process.env.GITHUB_FORCE_HTTPS === 'false')) {
  underscore.keys(v1).forEach((method) => { delete v1[method].auth })
}

module.exports.routes = [
  braveHapi.routes.async().path('/v1/entries/{shape}/{radius}').config(v1.getEntries),
  braveHapi.routes.async().path('/v1/entry/{privateID}').config(v1.getEntry),
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
