const fs = require('fs')

const gp = require('../../node_modules/geojson-precision')

const data = JSON.parse(fs.readFileSync('countries.geojson'))

data.features.forEach((feature) => {
  const geometry = feature.geometry

  const g = {
    Polygon: (coordinates) => {
      const result = []

      coordinates.forEach((ring) => {
        const outer = []

        ring.forEach((linestring) => {
          const inner = []

          linestring.forEach((position) => {
            inner.unshift(position)
          })
          outer.push(inner)
        })
        result.push(outer)
      })

      return result
    },

    MultiPolygon: (coordinates) => {
      const result = []

      coordinates.forEach((polygon) => {
        result.push(g.Polygon(polygon))
      })

      return result
    }
  }
  const f = g[geometry.type]

  if (!f) {
    console.log('unknown geometry type ' + geometry.type + ' for ' + JSON.stringify(feature.properties))
    process.exit(1)
  }

  geometry.coordinates = f(geometry.coordinates)
  feature.geometry = gp(geometry, 8)
})

console.log(JSON.stringify(data))
