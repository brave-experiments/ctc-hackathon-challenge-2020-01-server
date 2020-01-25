const Joi = require('@hapi/joi')
const boom = require('boom')
const bson = require('bson')
const underscore = require('underscore')

const utils = require('bat-utils')
const braveHapi = utils.extras.hapi

const entrykeys = require('./entry.js').joikeys

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
    categories: Joi.array().items(entrykeys.category).unique().required()
  }
}
joikeys.region = underscore.extend({}, joikeys.igbgd, {
  geometry: joikeys.geometry.required()
})

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

      return m2r(match, true)
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops', 'readonly' ],
    mode: 'required'
  },

  description: 'Get a particular region',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      regionID: joikeys.region.regionID
    })
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

      const status = await regions.update({ regionID: regionID }, state, { upsert: true })
      if (!status.result.ok) throw boom.badImplementation('database update failed: ' + regionID)

      const match = await regions.findOne({ regionID: regionID })
      if (!match) throw boom.notFound('no such region: ' + regionID)

      runtime.notify(debug, { text: 'update region ' + JSON.stringify(m2r(match)) })
      return {}
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops', 'readonly' ],
    mode: 'required'
  },

  description: 'Update a particular region',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      regionID: joikeys.region.regionID
    }),
    payload: Joi.object().keys({
      description: entrykeys.description.optional(),
      categories: Joi.array().items(entrykeys.category).unique().optional(),
      geometry: joikeys.geometry.optional()
    })
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

      runtime.notify(debug, { text: 'delete region ' + JSON.stringify(m2r(match)) })
      return {}
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops', 'readonly' ],
    mode: 'required'
  },

  description: 'Delete a particular region',
  tags: [ 'api' ],

  validate: {
    params: Joi.object().keys({
      regionID: joikeys.region.regionID
    })
  },

  response: {
    schema: Joi.object().length(0)
  }
}

/*
  POST /v1/region
 */

v1.postRegion = {
  handler: (runtime) => {
    return async (request, h) => {
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

      runtime.notify(debug, { text: 'create region ' + JSON.stringify(m2r(match)) })

      return {}
    }
  },

  auth: {
    strategy: 'session',
    scope: [ 'devops', 'readonly' ],
    mode: 'required'
  },

  description: 'Create a region',
  tags: [ 'api' ],

  validate: {
    payload: Joi.object().keys({
      type: Joi.string().valid('Feature').optional(),
      properties: Joi.object().keys({}).unknown().optional(),
      igbgd: Joi.object().keys(joikeys.igbgd).required(),
      geometry: joikeys.geometry.required()
    })
  },

  response: {
    schema: Joi.object().length(0)
  }
}

const m2r = (match, fullP) => {
  const region = underscore.pick(match, underscore.keys(joikeys.region))

  return (fullP ? region : underscore.omit(region, [ 'geometry' ]))
}

module.exports.routes = [
  braveHapi.routes.async().path('/v1/region/{regionID}').config(v1.getRegion),
  braveHapi.routes.async().put().path('/v1/region/{regionID}').config(v1.putRegion),
  braveHapi.routes.async().delete().path('/v1/region/{regionID}').config(v1.deleteRegion),
  braveHapi.routes.async().post().path('/v1/region').config(v1.postRegion)
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
