const Joi = require('@hapi/joi')
const bip39codec = require('bip39-codec')
const boom = require('boom')
const bson = require('bson')
const imagesize = require('image-size')
const underscore = require('underscore')
const uuidV4 = require('uuid/v4')

const utils = require('bat-utils')
const braveHapi = utils.extras.hapi

let m2region

const v1 = {}

const joikeys = {
  category: Joi.string().valid('green-iguana'),
  description: Joi.string().allow(''),
  entry: {
    privateID: Joi.string().guid().required().description('private identity of the entry'),
    publicID: Joi.string().guid().required().description('public identity of the entry'),
    metadata: Joi.object().unknown().optional().description('extensible properties')
  },
  image: {
    data: Joi.string().base64().description('base64 encoding'),
    format: Joi.string().valid('png').optional(),
    width: Joi.number().positive().optional(),
    height: Joi.number().positive().optional()
  },
  limit: Joi.number().positive().optional().description('the maximum number of entries to return'),
  location: {
    longitude: Joi.number().precision(8).min(-180).max(180).required().description('east-west'),
    latitude: Joi.number().precision(8).min(-90).max(90).required().description('north-south'),
    elevation: Joi.number().precision(3).optional().description('in meters')
  },
  radius: Joi.number().min(10).max(10000).required().description('in meters'),
  shape: Joi.string().regex(/^circle$/).required()
}
underscore.extend(joikeys.entry, {
  category: joikeys.category.required(),
  description: joikeys.description.required(),
  location: Joi.object().keys(joikeys.location).required(),
  image: Joi.object().keys(joikeys.image).required()
})

/*
  GET /v1/entries/{shape}/{radius}
*/

v1.getEntries = {
  handler: (runtime) => {
    return async (request, h) => {
      const query = request.query
      const find = {
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [ query.longitude, query.latitude ] },
            $maxDistance: Math.ceil(request.params.radius * 1.25)
          }
        },
        approved: true
      }

      const category = query.category
      if (category !== undefined) find.category = category

      const debug = braveHapi.debug(module, request)
      const entries = runtime.database.get('entries', debug)

      let limit = parseInt(query.limit, 10)
      if (isNaN(limit) || (limit > 512)) limit = 512

      const matches = await entries.find(find, { limit: limit })

      const result = []
      matches.forEach(match => { result.push(m2entry(match)) })

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
    }).required(),
    query: Joi.object().keys(underscore.extend({
      category: joikeys.category.optional(),
      limit: joikeys.limit
    }, joikeys.location))
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

      const debug = braveHapi.debug(module, request)
      const entries = runtime.database.get('entries', debug)
      const regions = runtime.database.get('regions', debug)

      let match = await entries.findOne({ privateID: privateID })
      if (match) throw boom.badData('entry already exists: ' + privateID)

      const publicID = uuidV4().toLowerCase()
      const image = imagesize(Buffer.from(payload.image.data, 'base64'))
      if (image.type !== 'png') throw boom.badData('invalid image type: ' + image.type)
      image.format = image.type
      underscore.extend(payload.image, underscore.pick(image, [ 'format', 'width', 'height' ]))

      const category = payload.category
      const location = { type: 'Point', coordinates: [ payload.location.longitude, payload.location.latitude ] }
      let tags = await m2tags(regions, { category: category, location: location })
      if (tags.length === 0) {
        tags = await m2tags(regions, { location: location })
        if (tags.length === 0) throw boom.badData('invalid location: ' + JSON.stringify(payload.location))

        throw boom.badData('invalid category for known regions: ' + category)
      }

      try {
        await entries.insert(underscore.extend(underscore.pick(payload, [ 'image', 'description' ]), {
          privateID: privateID,
          publicID: publicID,
          category: category,
          location: location,
          // next two temporary for now...
          approved: 'true',
          authority: 'automatic',
          timestamp: bson.Timestamp()
        }))
      } catch (ex) {
        runtime.notify(debug, { text: 'entries error: ' + ex.toString() })
        debug('entries error', ex)
        throw boom.badData(ex.toString())
      }

      match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.badImplementation('database creation failed: ' + privateID)

      runtime.notify(debug, { text: 'create entry ' + JSON.stringify(m2entry(match, tags)) })
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
    payload: Joi.object().keys(underscore.omit(joikeys.entry, [ 'publicID', 'metadata' ])).required()
  },

  response: {
    schema: Joi.object().keys(underscore.pick(joikeys.entry, [ 'publicID' ]))
  }
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

      return m2entry(match)
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
    }).required()
  },

  response: {
    schema: Joi.object().keys(underscore.omit(joikeys.entry, [ 'privateID' ]))
  }
}

/*
  PUT /v1/entry/{privateID}
 */

v1.putEntry = {
  handler: (runtime) => {
    return async (request, h) => {
      const payload = request.payload
      const privateID = request.params.privateID

      if (underscore.keys(payload).length === 0) throw boom.badData('empty update')

      const debug = braveHapi.debug(module, request)
      const entries = runtime.database.get('entries', debug)
      const regions = runtime.database.get('regions', debug)

      let match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.notFound('no such entry: ' + privateID)

      if (payload.image) {
        const image = imagesize(Buffer.from(payload.image.data, 'base64'))
        if (image.type !== 'png') throw boom.badData('invalid image type: ' + image.type)
        image.format = image.type
        underscore.extend(payload.image, underscore.pick(image, [ 'format', 'width', 'height' ]))
      }

      if (payload.category || payload.location) {
        const category = payload.category || match.category
        if (payload.location) {
          payload.location = { type: 'Point', coordinates: [ payload.location.longitude, payload.location.latitude ] }
        }

        const location = payload.location || match.location
        let tags = await m2tags(regions, { category: category, location: location })
        if (tags.length === 0) {
          tags = await m2tags(regions, { location: location })
          if (tags.length === 0) throw boom.badData('invalid location: ' + JSON.stringify(location))

          throw boom.badData('invalid category for known regions: ' + category)
        }
      }

      const state = {
        $set: payload,
        $currentDate: { timestamp: { $type: 'timestamp' } }
      }

      const status = await entries.update({ privateID: privateID }, state, { upsert: false })
      if (!status.ok) throw boom.badImplementation('database update failed: ' + privateID)

      match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.notFound('no such entry: ' + privateID)

      const tags = await m2tags(regions, match)

      runtime.notify(debug, { text: 'update entry ' + JSON.stringify(m2entry(match, tags)) })
      return {}
    }
  },

  auth: {
    strategy: 'simple-scoped-token',
    scope: ['global'],
    mode: 'required'
  },

  description: 'Update a particular entry',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      privateID: joikeys.entry.privateID
    }).required(),
    payload: Joi.object().keys({
      category: joikeys.category.optional(),
      description: joikeys.description.optional(),
      location: Joi.object().keys(joikeys.location).optional(),
      image: Joi.object().keys(joikeys.image).optional()
    }).required()
  },

  response: {
    schema: Joi.object().length(0)
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
      const regions = runtime.database.get('regions', debug)

      let match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.notFound('no such entry: ' + privateID)

      const tags = await m2tags(regions, match)

      const status = await entries.remove({ privateID: privateID }, { single: true })
      if ((!status.result) || (!status.result.ok)) throw boom.badImplementation('database deletion failed: ' + privateID)
      if (status.deletedCount === 0) throw boom.notFound('no such entry: ' + privateID)

      runtime.notify(debug, { text: 'delete entry ' + JSON.stringify(m2entry(match, tags)) })
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
    }).required()
  },

  response: {
    schema: Joi.object().length(0)
  }
}

/*
  GET /v1/entry/{privateID}/regions
 */

v1.getEntryRegions = {
  handler: (runtime) => {
    return async (request, h) => {
      const privateID = request.params.privateID

      const debug = braveHapi.debug(module, request)
      const entries = runtime.database.get('entries', debug)
      const regions = runtime.database.get('regions', debug)

      const match = await entries.findOne({ privateID: privateID })
      if (!match) throw boom.notFound('no such entry: ' + privateID)

      let limit = parseInt(request.query.limit, 10)
      if (isNaN(limit)) limit = undefined

      const matches = await regions.find({ geometry: { $geoIntersects: { $geometry: match.location } } }, { limit: limit })

      const result = []
      matches.forEach(match => { result.push(m2region(match, true)) })

      return result
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops', 'readonly', 'reviewer' ],
    mode: 'required'
  },

  description: 'Get regions containing a particular entry',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      privateID: joikeys.entry.privateID
    }).required(),
    query: Joi.object().keys({
      limit: joikeys.limit
    })
  },

  response: {
    schema: Joi.array().items(Joi.object().unknown())
  }
}

const m2entry = (match, regions) => {
  const entry = underscore.pick(match, underscore.keys(joikeys.entry))
  const coordinates = match.location.coordinates
  const octets = []

  entry.location = { longitude: coordinates[0], latitude: coordinates[1] }
  if (coordinates.length > 2) entry.location.elevation = coordinates[2]

  // cf., https://github.com/uuidjs/uuid/blob/master/lib/v35.js#L3
  entry.publicID.replace(/[a-fA-F0-9]{2}/g, (hex) => { octets.push(parseInt(hex, 16)) })
  // the BIP39 words tend to be shorter and easier to pronounce than niceware...
  entry.metadata = underscore.extend(match.metadata || {}, {
    words: bip39codec.encode(Buffer.from(octets)),
    created: new Date(parseInt(match._id.toHexString().substring(0, 8), 16) * 1000).getTime(),
    modified: (match.timestamp.high_ * 1000) + (match.timestamp.low_ / bson.Timestamp.TWO_PWR_32_DBL_)
  }, underscore.pick(match, [ 'approved', 'authority' ]))

  if (regions) {
    entry.image.data = '...'
    entry.regions = regions
  } else if (regions !== false) {
    delete entry.privateID
  }

  return entry
}

const m2tags = async (regions, match) => {
  const matches = await regions.find({
    categories: match.category,
    geometry: {
      $geoIntersects: {
        $geometry: match.location
      }
    }
  })

  const tags = []
  matches.forEach((match) => { tags.push(match.regionID) })

  return tags
}

module.exports.routes = [
  braveHapi.routes.async().path('/v1/entries/{shape}/{radius}').config(v1.getEntries),
  braveHapi.routes.async().post().path('/v1/entry').config(v1.postEntry),
  braveHapi.routes.async().path('/v1/entry/{privateID}').config(v1.getEntry),
  braveHapi.routes.async().put().path('/v1/entry/{privateID}').config(v1.putEntry),
  braveHapi.routes.async().delete().path('/v1/entry/{privateID}').config(v1.deleteEntry),
  braveHapi.routes.async().path('/v1/entry/{privateID}/regions').config(v1.getEntryRegions)

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
        approved: false,
        authority: '',
        timestamp: bson.Timestamp.ZERO
      },
      unique: [ { publicID: 1 }, { privateID: 1 } ],
      others: [ { category: 1 }, { approved: 1 }, { authority: 1 }, { timestamp: 1 } ],
      raw: [ { location: '2dsphere' } ]
    }
  ])

  const entries = runtime.database.get('entries', debug)
  entries.update({}, { $set: { approved: true, authority: 'automatic' } }, { multi: true })

  const region = require('./region.js')
  m2region = region.m2region
}

module.exports.entrykeys = joikeys
module.exports.m2entry = m2entry
