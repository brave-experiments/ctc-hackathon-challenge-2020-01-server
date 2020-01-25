# Initial Data Set

# GEO JSON
The file [countries.geojson](https://datahub.io/core/geo-countries/r/countries.geojson) was retrieved from this
[site](https://datahub.io/core/geo-countries).
For some reason,
many [GeoJSON](https://geojson.org) files have the longitude/latitude flipped.
The ordering should be:

    [ longitude, latitude ]
    
The `countries.json` file in this repository has the values in the correct order:

    node flip.js > countries.json

A region file consists of a GEO JSON `Feature` object.
For the `POST /v1/region` operation:

- the `type` and `properties` properties are ignored;

- the `geometry` property is required; and,

- the `igbgd` property must be added:

    - `regionID` - a unique-identifier specified as a dot-separated string of tokens
    
    - `description` - a textual description
    
    - `categories` - an array of categories
