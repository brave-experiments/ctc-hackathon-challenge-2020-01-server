const Joi = require('@hapi/joi')
const boom = require('boom')
const bson = require('bson')
const underscore = require('underscore')

const utils = require('bat-utils')
const braveHapi = utils.extras.hapi

const { entrykeys, m2entry } = require('./entry.js')

const v1 = {}

const joikeys = {
  // cf., https://tools.ietf.org/html/rfc7946
  geometry: Joi.object().keys({
    type: Joi.string().valid('MultiPolygon'),
    coordinates: Joi.array().items(Joi.array().items(
      Joi.array().items(
        Joi.array().items(entrykeys.location.longitude, entrykeys.location.latitude, entrykeys.location.elevation)
      )
    ))
  }),
  igbgd: {
    regionID: Joi.string().domain({ allowUnicode: false, tlds: false }).required(),
    description: entrykeys.description.required(),
    categories: Joi.array().items(entrykeys.category).unique().required(),
    view: Joi.object().keys({}).unknown().optional()
    /*
    view: Joi.object().keys({
      center: Joi.array().items(entrykeys.location.longitude, entrykeys.location.latitude, entrykeys.location.elevation),
      view: Joi.number().min(0).max(20),
      options: Joi.object().keys({}).unknown().optional()
    }).optional()
     */
  },
  limit: Joi.number().positive().optional().description('the maximum number of entries to return')
}
joikeys.region = underscore.extend({}, joikeys.igbgd, {
  geometry: joikeys.geometry.required(),
  metadata: Joi.object().unknown().optional().description('extensible properties')
})

/*
  POST /v1/region
 */

v1.postRegion = {
  handler: (runtime) => {
    return async (request, h) => {
      /* for future auditing...
      const authority = request.auth.credentials.provider + ':' + request.auth.credentials.profile.username
       */
      const payload = request.payload
      const regionID = payload.igbgd.regionID

      const debug = braveHapi.debug(module, request)
      const regions = runtime.database.get('regions', debug)

      let match = await regions.findOne({ regionID: regionID })
      if (match) throw boom.badData('entry already exists: ' + regionID)

      try {
        await regions.insert(underscore.extend({}, payload.igbgd, { geometry: payload.geometry, timestamp: bson.Timestamp() }))
      } catch (ex) {
        runtime.notify(debug, { text: 'regions error: ' + ex.toString() })
        debug('regions error', ex)
        throw boom.badData(ex.toString())
      }

      match = await regions.findOne({ regionID: regionID })
      if (!match) throw boom.badImplementation('database creation failed: ' + regionID)

      runtime.notify(debug, { text: 'create region ' + JSON.stringify(m2region(match)) })
      return {}
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops' ],
    mode: 'required'
  },

  description: 'Create a region',
  tags: [ 'api' ],

  validate: {
    payload: Joi.object().keys({
      type: Joi.string().valid('Feature').required(),
      properties: Joi.object().keys({}).unknown().optional(),
      igbgd: Joi.object().keys(joikeys.igbgd).required(),
      geometry: joikeys.geometry.required()
    }).required()
  },

  response: {
    schema: Joi.object().length(0)
  }
}

/*
  GET /v1/region/{regionID}
 */

v1.getRegion = {
  handler: (runtime) => {
    return async (request, h) => {
      const regionID = request.params.regionID

      const debug = braveHapi.debug(module, request)
      const regions = runtime.database.get('regions', debug)

      const match = await regions.findOne({ regionID: regionID })
      if (!match) throw boom.notFound('no such region: ' + regionID)

      return m2region(match, true)
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops', 'readonly', 'reviewer' ],
    mode: 'required'
  },

  description: 'Get a particular region',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      regionID: joikeys.region.regionID
    }).required()
  },

  response: {
    schema: Joi.object().keys(joikeys.region)
  }
}

/*
  PUT /v1/region/{regionID}
 */

v1.putRegion = {
  handler: (runtime) => {
    return async (request, h) => {
      const payload = request.payload
      const regionID = request.params.regionID

      if (underscore.keys(payload).length === 0) throw boom.badData('empty update')

      const debug = braveHapi.debug(module, request)
      const regions = runtime.database.get('regions', debug)

      const state = {
        $set: payload,
        $currentDate: { timestamp: { $type: 'timestamp' } }
      }

      const status = await regions.update({ regionID: regionID }, state, { upsert: false })
      if (!status.ok) throw boom.badImplementation('database update failed: ' + regionID)

      const match = await regions.findOne({ regionID: regionID })
      if (!match) throw boom.notFound('no such region: ' + regionID)

      runtime.notify(debug, { text: 'update region ' + JSON.stringify(m2region(match)) })
      return {}
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops' ],
    mode: 'required'
  },

  description: 'Update a particular region',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      regionID: joikeys.region.regionID
    }).required(),
    payload: Joi.object().keys({
      categories: Joi.array().items(entrykeys.category).unique().optional(),
      description: entrykeys.description.optional(),
      geometry: joikeys.geometry.optional(),
      view: joikeys.igbgd.view
    }).required()
  },

  response: {
    schema: Joi.object().length(0)
  }
}

/*
  DELETE /v1/region/{regionID}
 */

v1.deleteRegion = {
  handler: (runtime) => {
    return async (request, h) => {
      const regionID = request.params.regionID

      const debug = braveHapi.debug(module, request)
      const regions = runtime.database.get('regions', debug)

      const match = await regions.findOne({ regionID: regionID })
      if (!match) throw boom.notFound('no such region: ' + regionID)

      const status = await regions.remove({ regionID: regionID }, { single: true })
      if ((!status.result) || (!status.result.ok)) throw boom.badImplementation('database deletion failed: ' + regionID)
      if (status.deletedCount === 0) throw boom.notFound('no such region: ' + regionID)

      runtime.notify(debug, { text: 'delete region ' + JSON.stringify(m2region(match)) })
      return {}
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops' ],
    mode: 'required'
  },

  description: 'Delete a particular region',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      regionID: joikeys.region.regionID
    }).required()
  },

  response: {
    schema: Joi.object().length(0)
  }
}

/*
  GET /v1/region/{regionID}/entries
 */

v1.getRegionEntries = {
  handler: (runtime) => {
    return async (request, h) => {
      const regionID = request.params.regionID

      const debug = braveHapi.debug(module, request)
      const regions = runtime.database.get('regions', debug)
      const entries = runtime.database.get('entries', debug)

      const match = await regions.findOne({ regionID: regionID })
      if (!match) throw boom.notFound('no such region: ' + regionID)

      let limit = parseInt(request.query.limit, 10)
      if (isNaN(limit)) limit = undefined

      const matches = await entries.find({ location: { $geoWithin: { $geometry: match.geometry } } }, { limit: limit })

      const result = []
      matches.forEach(match => { result.push(m2entry(match)) })

      return result
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops', 'readonly', 'reviewer' ],
    mode: 'required'
  },

  description: 'Get entries within a particular region',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      regionID: joikeys.region.regionID
    }).required(),
    query: Joi.object().keys({
      limit: joikeys.limit
    })
  },

  response: {
    schema: Joi.array().items(Joi.object().keys(underscore.omit(entrykeys.entry, [ 'privateID' ])))
  }
}

/*
  GET /v1/regions
 */

v1.getRegions = {
  handler: (runtime) => {
    return async (request, h) => {
      const debug = braveHapi.debug(module, request)
      const regions = runtime.database.get('regions', debug)

      const matches = await regions.find()

      const options = { google_token: process.env.GOOGLE_TOKEN, mapbox_token: process.env.MAPBOX_TOKEN }

      const result = []
      matches.forEach(match => {
        if (!match.view) return

        if (!match.view.options) match.view.options = {}
        underscore.defaults(match.view.options, options)
        result.push(m2region(match))
      })

      return result
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops', 'readonly', 'reviewer' ],
    mode: 'required'
  },

  description: 'Get all regions',
  tags: [ 'api' ],

  validate: {
  },

  response: {
    schema: Joi.array().items(Joi.object().keys(underscore.omit(joikeys.region, [ 'geometry' ])))
  }
}

const m2region = (match, fullP) => {
  const region = underscore.pick(match, underscore.keys(joikeys.region))

  region.metadata = underscore.extend(match.metadata || {}, {
    created: new Date(parseInt(match._id.toHexString().substring(0, 8), 16) * 1000).getTime(),
    modified: (match.timestamp.high_ * 1000) + (match.timestamp.low_ / bson.Timestamp.TWO_PWR_32_DBL_)
  })

  return (fullP ? region : underscore.omit(region, [ 'geometry' ]))
}

module.exports.routes = [
  braveHapi.routes.async().post().path('/v1/region').config(v1.postRegion),
  braveHapi.routes.async().path('/v1/region/{regionID}').config(v1.getRegion),
  braveHapi.routes.async().put().path('/v1/region/{regionID}').config(v1.putRegion),
  braveHapi.routes.async().delete().path('/v1/region/{regionID}').config(v1.deleteRegion),
  braveHapi.routes.async().path('/v1/region/{regionID}/entries').config(v1.getRegionEntries),
  braveHapi.routes.async().path('/v1/regions').config(v1.getRegions)
]

module.exports.initialize = async (debug, runtime) => {
// do not require login to do a ping on a development server lacking github login
  if ((process.env.NODE_ENV === 'development') && (!runtime.config.login.github)) {
    underscore.keys(v1).forEach((method) => { delete v1[method].auth })
  }

  runtime.database.checkIndices(debug, [
    {
      category: runtime.database.get('regions', debug),
      name: 'regions',
      property: 'regionID',
      empty: {
        regionID: '',
        categories: '',
        description: '',
        timestamp: bson.Timestamp.ZERO
      },
      unique: [ { regionID: 1 } ],
      others: [ { categories: 1 }, { timestamp: 1 } ],
      raw: [ { geometry: '2dsphere' } ]
    }
  ])
}

module.exports.m2region = m2region
