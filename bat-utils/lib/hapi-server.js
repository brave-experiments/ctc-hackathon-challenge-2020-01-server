const dns = require('dns')
const os = require('os')
const _ = require('underscore')
const authBearerToken = require('hapi-auth-bearer-token')
const hapiCookie = require('@hapi/cookie')
const cryptiles = require('cryptiles')
const bell = require('@hapi/bell')
const hapi = require('@hapi/hapi')
const inert = require('@hapi/inert')
const underscore = require('underscore')
const vision = require('@hapi/vision')
const hapiRequireHTTPS = require('hapi-require-https')
const SDebug = require('sdebug')

const rateLimiter = require('./hapi-rate-limiter')
const swagger = require('./hapi-swagger')
const braveHapi = require('./extras-hapi')
const whitelist = require('./hapi-auth-whitelist')
const npminfo = require('../npminfo')

module.exports = async (options, runtime) => {
  try {
    const srvr = await Server(options, runtime)
    return srvr
  } catch (e) {
    console.log(e)
  }
}

const pushScopedTokens = pushTokens({
  TOKEN_LIST: 'global',
  // env var       // scope key
  ALLOWED_STATS_TOKENS: 'stats',
  ALLOWED_REFERRALS_TOKENS: 'referrals',
  ALLOWED_ADS_TOKENS: 'ads',
  ALLOWED_PUBLISHERS_TOKENS: 'publishers'
})

function pushTokens (map) {
  const keys = _.keys(map)
  return (token, memo = []) => {
    return keys.reduce((memo, key) => {
      const value = map[key]
      const envTokens = process.env[key]
      const TOKENS = envTokens ? envTokens.split(',') : []
      const has = braveHapi.isSimpleTokenValid(TOKENS, token)
      return memo.concat(has ? [value] : [])
    }, memo)
  }
}

async function Server (options, runtime) {
  const debug = new SDebug('web')

  const serverOpts = {
    port: options.port,
    host: '0.0.0.0',
    routes: {
      validate: {
        failAction: async (request, h, err) => {
          throw err
        }
      }
    }
  }
  const server = new hapi.Server(serverOpts)

  if (!runtime) {
    runtime = options
    options = {}
  }
  underscore.defaults(options, { id: server.info.id, module: module, headersP: true, remoteP: true })
  if (!options.routes) options.routes = require('./controllers/index')

  debug.initialize({ web: { id: options.id } })
  debug('server opts', serverOpts)

  if (process.env.NODE_ENV !== 'production') {
    process.on('warning', (warning) => {
      if (warning.name === 'DeprecationWarning') return

      debug('warning', underscore.pick(warning, [ 'name', 'message', 'stack' ]))
    })
  }

  const { prometheus } = runtime
  const plugins = [].concat(
    prometheus ? [
      prometheus.plugin()
    ] : [],
    [
      bell,
      authBearerToken,
      hapiCookie,
      {
        plugin: whitelist.plugin
      },
      inert,
      vision,
      rateLimiter(runtime),
      swagger()
    ], process.env.NODE_ENV === 'production' ? [
      {
        plugin: hapiRequireHTTPS,
        options: { proxy: true }
      }
    ] : []
  )
  await server.register(plugins)

  debug('extensions registered')

  if (runtime.login) {
    if (runtime.login.github) {
      const { github } = runtime.login
      server.auth.strategy('github', 'bell', {
        provider: 'github',
        password: cryptiles.randomString(64),
        clientId: github.clientId,
        clientSecret: github.clientSecret,
        isSecure: github.isSecure,
        forceHttps: github.isSecure,
        scope: ['user:email', 'read:org'],
        location: (process.env.HOST.startsWith('127.0.0.1') ? 'http://' : 'https://') + process.env.HOST
      })

      debug('github authentication: forceHttps=' + github.isSecure)

      server.auth.strategy('session', 'cookie', {
        redirectTo: '/v1/login',
        cookie: {
          password: github.ironKey,
          isSecure: github.isSecure
        }
      })

      debug('session authentication strategy via cookie')
    } else {
      debug('github authentication disabled')
      if (process.env.NODE_ENV === 'production') {
        throw new Error('github authentication was not enabled yet we are in production mode')
      }

      const bearerAccessTokenConfig = {
        allowQueryToken: true,
        allowMultipleHeaders: false,
        allowChaining: true,
        validate: (request, token, h) => {
          const scope = process.env.GITHUB_TEAMS ? process.env.GITHUB_TEAMS.split(',') : ['devops', 'ledger', 'QA']
          const tokenlist = process.env.TOKEN_LIST ? process.env.TOKEN_LIST.split(',') : []
          const isValid = typeof token === 'string' && braveHapi.isSimpleTokenValid(tokenlist, token)
          return {
            isValid,
            artifacts: null,
            credentials: {
              token,
              scope
            }
          }
        }
      }

      server.auth.strategy('session', 'bearer-access-token', bearerAccessTokenConfig)
      server.auth.strategy('github', 'bearer-access-token', bearerAccessTokenConfig)

      debug('session authentication strategy via bearer-access-token')
      debug('github authentication strategy via bearer-access-token')
    }
  }

  server.auth.strategy('simple-scoped-token', 'bearer-access-token', {
    allowQueryToken: true,
    allowMultipleHeaders: false,
    allowChaining: true,
    validate: (request, token, h) => {
      const scope = pushScopedTokens(token)
      const isValid = !!scope.length
      const credentials = {}
      if (isValid) {
        Object.assign(credentials, {
          token,
          scope
        })
      }
      return {
        isValid,
        artifacts: null,
        credentials
      }
    }
  })
  debug('simple-scoped-token authentication strategy via bearer-access-token')

  server.ext('onRequest', (request, h) => {
    const headers = options.headersP &&
          underscore.omit(request.headers, (value, key, object) => {
            if ([ 'authorization', 'cookie' ].indexOf(key) !== -1) return true
            return /^x-forwarded-/i.test(key)
          })
    const query = underscore.omit(request.url.query, (value, key, object) => {
      return ([ 'publisher' ].indexOf(key) !== -1)
    })
    const remote = options.remoteP &&
          { address: whitelist.ipaddr(request), port: request.headers['x-forwarded-port'] || request.info.remotePort }

    if (request.headers['x-request-id']) request.id = request.headers['x-request-id']
    debug('begin', {
      sdebug: {
        request: {
          id: request.id,
          method: request.method.toUpperCase(),
          pathname: request.url.pathname
        },
        query: query,
        params: request.url.params,
        headers: headers,
        remote: remote
      }
    })

    return h.continue
  })

  server.ext('onPreResponse', (request, h) => {
    const response = request.response

    if (response.isBoom && response.output.statusCode >= 500) {
      const error = response

      runtime.captureException(error, { req: request })
      if (process.env.NODE_ENV === 'development') {
        error.output.payload.message = error.message
        if (error.body) {
          error.output.payload.body = error.body
        }
        error.output.payload.stack = error.stack

        throw error
      }
    }

    if ((!response.isBoom) || (response.output.statusCode !== 401)) {
      if (typeof response.header === 'function') response.header('Cache-Control', 'private')
      return h.continue
    }

    return h.continue
  })

  server.events.on('log', (event, tags) => {
    if ((!event.data) || event.data === 'undefined') {
      console.log('!!!')
      debug('log', { stack: (new Error()).stack })
      return console.log('!!!')
    }

    debug(event.data, { tags: tags })
  }).on('request', (request, event, tags) => {
    debug(event.data, { tags: tags }, { sdebug: { request: { id: event.request, internal: event.internal } } })
  }).on({ name: 'request', channels: 'internal' }, (request, event, tags) => {
    let params

    if ((!tags) || (!tags.received)) return

    params = {
      request: {
        id: request.id,
        method: request.method.toUpperCase(),
        pathname: request.url.pathname
      },
      tags
    }

    debug('begin', { sdebug: params })
  }).on('response', (request) => {
    if (!request.response) request.response = {}
    const flattened = {}
    const logger = request._logger || []
    const params = {
      request: {
        id: request.id,
        method: request.method.toUpperCase(),
        pathname: request.url.pathname,
        statusCode: request.response.statusCode
      },
      headers: request.response.headers,
      error: braveHapi.error.inspect(request.response._error)
    }

    if ((request.response.statusCode === 401) || (request.response.statusCode === 406)) {
      runtime.captureException(request.response._error || request.response.statusCode, {
        req: request,
        extra: { address: whitelist.ipaddr(request) }
      })
    }

    logger.forEach((entry) => {
      if ((entry.data) && (typeof entry.data.msec === 'number')) { params.request.duration = entry.data.msec }
    })

    if ((runtime.newrelic) && (request.response._error)) {
      underscore.keys(params).forEach(param => {
        underscore.keys(params[param]).forEach(key => {
          if ((param === 'error') && ((key === 'message') || (key === 'payload') || (key === 'stack'))) return

          flattened[param + '.' + key] = params[param][key]
        })
      })
      flattened.url = flattened['request.pathname']
      delete flattened['request.pathname']
      runtime.newrelic.noticeError(request.response._error, flattened)
    }

    debug('end', { sdebug: params })
  })

  server.route(await options.routes.routes(debug, runtime, options))
  server.route({ method: 'GET', path: '/favicon.ico', handler: { file: './documentation/favicon.ico' } })
  server.route({ method: 'GET', path: '/favicon.png', handler: { file: './documentation/favicon.png' } })
  server.route({ method: 'GET', path: '/robots.txt', handler: { file: './documentation/robots.txt' } })
  if (options.routes.statics) options.routes.statics.forEach((route) => { server.route(route) })
  if (process.env.ACME_CHALLENGE) {
    server.route({
      method: 'GET',
      path: '/.well-known/acme-challenge/' + process.env.ACME_CHALLENGE.split('.')[0],
      handler: (request, h) => process.env.ACME_CHALLENGE
    })
  }
  // automated fishing expeditions shouldn't result in devops alerts...
  server.route({ method: 'GET', path: '/{path*}', handler: { file: './documentation/robots.txt' } })

  try {
    debug('starting server')
    await server.start()
  } catch (err) {
    debug('unable to start server', err)
    throw err
  }
  debug('started server')

  let resolvers = underscore.uniq([ '8.8.8.8', '8.8.4.4' ].concat(dns.getServers()))

  dns.setServers(resolvers)
  debug('webserver started',
    underscore.extend(
      { server: runtime.config.server.href, version: server.version, resolvers: resolvers },
      server.info,
      {
        env: underscore.pick(process.env, [ 'DEBUG', 'DYNO', 'NEW_RELIC_APP_NAME', 'NODE_ENV', 'BATUTIL_SPACES' ]),
        options: underscore.pick(options, [ 'headersP', 'remoteP' ])
      }))
  runtime.notify(debug, {
    text: os.hostname() + ' ' + npminfo.name + '@' + npminfo.version + ' started ' +
      (process.env.DYNO || 'web') + '/' + options.id
  })

  if (process.send) { process.send('started') }

  return server
}
