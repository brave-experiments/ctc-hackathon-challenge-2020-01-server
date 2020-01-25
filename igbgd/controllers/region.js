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
  }).required(),

  regionID: Joi.string().domain({ allowUnicode: false, tlds: false }).required()
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

      runtime.notify(debug, { text: 'create region ' +
                              JSON.stringify(underscore.omit(match, [ '_id', 'geometry', 'timestamp' ])) })

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
      type: Joi.string().valid('Feature'),
      properties: Joi.object().keys({}).unknown().optional(),

      igbgd: Joi.object().keys({
        regionID: joikeys.regionID,
        description: entrykeys.description.required(),
        categories: Joi.array().items(entrykeys.category).unique().required()
      }).required(),

      geometry: joikeys.geometry
    })
  },

  response: {
    schema: Joi.object().length(0)
  }
}

module.exports.routes = [
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
