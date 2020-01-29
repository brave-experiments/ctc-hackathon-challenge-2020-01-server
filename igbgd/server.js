if (process.env.NODE_ENV !== 'production') require('dotenv').config()

const config = require('../config.js')
const utils = require('../bat-utils')

const {
  hapi,
  Runtime
} = utils

const {
  controllers,
  server: hapiServer
} = hapi

const parentModules = [
  require('./controllers/entry'),
  require('./controllers/region')
]

const options = {
  port: process.env.PORT,
  parentModules,
  routes: controllers.index,
  controllers: controllers,
  module: module
}
options.routes.statics = [
  { method: 'GET', path: '/igbgd/{param*}', handler: { directory: { path: './documentation/igbgd', index: 'index.html' } } }
]

module.exports = hapiServer(options, new Runtime(config))
