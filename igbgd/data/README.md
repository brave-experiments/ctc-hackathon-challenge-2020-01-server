# Initial Data Set

# GEO JSON
You can find [GeoJSON](https://geojson.org) files [here](https://github.com/georgique/world-geojson).

Sadly in many data sets,
there is an endian-issue with the ordering of longitude and latitude.
The ordering should be:

    [ longitude, latitude ]
    
but many datasets including the one above,
flip the order.
Hence:

    node flip.js < input.geojson > output.geojson

A region file consists of a GEO JSON `Feature` object.
For the `POST /v1/region` operation:

- the `type` and `properties` properties are ignored;

- the `geometry` property is required; and,

- the `igbgd` property must be added:

    - `regionID` - a unique-identifier specified as a dot-separated string of tokens
    
    - `description` - a textual description
    
    - `categories` - an array of categories


# Acknowledgements
Thank you [@georgique](https://github.com/georgique).

Also, I find it useful to use [geojson.io](http://geojson.io) to quickly view GEO JSON data.

I'm also a big fan of [geojson-regions](https://geojson-maps.ash.ms/).
Thank you [AshKyd](https://github.com/AshKyd).
