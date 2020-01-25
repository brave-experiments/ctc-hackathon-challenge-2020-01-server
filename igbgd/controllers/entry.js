const Joi = require('@hapi/joi')
const boom = require('boom')
const bson = require('bson')
const imagesize = require('image-size')
const underscore = require('underscore')
const uuidV4 = require('uuid/v4')

const utils = require('bat-utils')
const braveHapi = utils.extras.hapi

const v1 = {}

const joikeys = {
  category: Joi.string().valid('green-iguana'),
  description: Joi.string(),
  entry: {
    privateID: Joi.string().guid().required().description('private identity of the entry'),
    publicID: Joi.string().guid().required().description('public identity of the entry')
  },
  image: {
    data: Joi.string().base64().description('base64 encoding'),
    format: Joi.string().valid('png'),
    width: Joi.number().positive().optional(),
    height: Joi.number().positive().optional()
  },
  limit: Joi.number().positive().max(25).optional().description('the maximum number of entries to return'),
  location: {
    longitude: Joi.number().precision(8).min(-180).max(180).required().description('east-west'),
    latitude: Joi.number().precision(8).min(-90).max(90).required().description('north-south'),
    elevation: Joi.number().precision(3).optional().description('in meters')
  },
  radius: Joi.number().min(10).max(10000).description('in meters'),
  shape: Joi.string().regex(/^circle$/).required()
}
underscore.extend(joikeys.entry, {
  category: joikeys.category.required(),
  description: joikeys.description.optional(),
  location: Joi.object().keys(joikeys.location).required(),
  image: Joi.object().keys(joikeys.image).required()
})

/*
  GET /v1/enties/{shape}/{radius}
*/

v1.getEntries = {
  handler: (runtime) => {
    return async (request, h) => {
      const radius = Math.ceil(request.params.radius * 1.25)
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

      const matches = await entries.find(find, { limit: limit })

      const result = []
      matches.forEach(match => { result.push(m2e(match)) })

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

const m2e = (match, tags) => {
  const entry = underscore.pick(match, underscore.keys(joikeys.entry))
  const coordinates = match.location.coordinates

  entry.location = { longitude: coordinates[0], latitude: coordinates[1] }
  if (coordinates.length > 2) entry.location.elevation = coordinates[2]

  if (tags) {
    entry.image.data = '...'
    if (tags !== true) entry.tags = tags
  } else {
    delete entry.privateID
  }

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

  description: 'Get a particular entry',
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
  DELETE /v1/entry/{privateID}
 */

v1.deleteEntry = {
  handler: (runtime) => {
    return async (request, h) => {
      const privateID = request.params.privateID

      const debug = braveHapi.debug(module, request)
      const entries = runtime.database.get('entries', debug)

      const match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.notFound('no such entry: ' + privateID)

      const status = await entries.remove({ privateID: privateID }, { single: true })
      if ((!status.result) || (!status.result.ok)) throw boom.badImplementation('database deletion failed: ' + privateID)
      if (status.deletedCount === 0) throw boom.notFound('no such entry: ' + privateID)

      runtime.notify(debug, { text: 'delete ' + JSON.stringify(m2e(match, true)) })
      return {}
    }
  },

  auth: {
    strategy: 'simple-scoped-token',
    scope: ['global'],
    mode: 'required'
  },

  description: 'Delete a particular entry',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      privateID: joikeys.entry.privateID
    })
  },

  response: {
    schema: Joi.object().length(0)
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
      const image = imagesize(Buffer.from(payload.image.data, 'base64'))
      if (image.type !== 'png') throw boom.badData('invalid image type: ' + image.type)
      image.format = image.type
      underscore.extend(payload.image, underscore.pick(image, [ 'format', 'width', 'height' ]))

      const category = payload.category
      const location = { type: 'Point', coordinates: [ payload.location.longitude, payload.location.latitude ] }
      const regions = runtime.database.get('regions', debug)
      let matches = await regions.find({
        geometry: {
          $geoIntersects: {
            $geometry: location
          }
        }
      })
      if (matches.length === 0) throw boom.badData('invalid category for known regions: ' + category)

      const tags = []
      matches.forEach((match) => { tags.push(match.regionID) })

      try {
        await entries.insert(underscore.extend(underscore.pick(payload, [ 'image', 'description' ]), {
          privateID: privateID,
          publicID: publicID,
          category: category,
          location: location,
          timestamp: bson.Timestamp()
        }))
      } catch (ex) {
        runtime.notify(debug, { text: 'entries error: ' + ex.toString() })
        debug('entries error', ex)
        throw boom.badData(ex.toString())
      }

      match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.badImplementation('database creation failed: ' + privateID)

      runtime.notify(debug, { text: 'create entry ' + JSON.stringify(m2e(match, tags)) })

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

module.exports.routes = [
  braveHapi.routes.async().path('/v1/entries/{shape}/{radius}').config(v1.getEntries),
  braveHapi.routes.async().path('/v1/entry/{privateID}').config(v1.getEntry),
  braveHapi.routes.async().delete().path('/v1/entry/{privateID}').config(v1.deleteEntry),
  braveHapi.routes.async().post().path('/v1/entry').config(v1.postEntry)
]

module.exports.initialize = async (debug, runtime) => {
  // do not require access tokens on a development server lacking https
  if ((process.env.NODE_ENV === 'development') && (runtime.config.server.protocol === 'http:')) {
    underscore.keys(v1).forEach((method) => { delete v1[method].auth })
  }

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
}

module.exports.joikeys = joikeys
