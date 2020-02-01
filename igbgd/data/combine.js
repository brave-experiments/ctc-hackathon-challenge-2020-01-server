const fs = require('fs')

const gp = require('../../node_modules/geojson-precision')

const data = JSON.parse(fs.readFileSync(0))

const polygons = []

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
            inner.push(position)
          })
          outer.push(inner)
        })
        result.push(outer)
      })

      polygons.push(result)
    },

    MultiPolygon: (coordinates) => {
      coordinates.forEach((polygon) => {
        polygons.push(g.Polygon(polygon))
      })
    }
  }
  const f = g[geometry.type]

  if (!f) {
    console.log('unknown geometry type ' + geometry.type + ' for ' + JSON.stringify(feature.properties))
    process.exit(1)
  }

  f(geometry.coordinates)
})

console.log(JSON.stringify({
  type: 'Feature',
  properties: {},
  geometry: gp({ type: 'MultiPolygon', coordinates: polygons }, 8)
}, null, 0))
