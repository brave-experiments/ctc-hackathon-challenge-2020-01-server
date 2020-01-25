# Initial Data Set

# GEO JSON
The file [countries.geojson](https://datahub.io/core/geo-countries/r/countries.geojson) is from this
[site](https://datahub.io/core/geo-countries).

Note that the polygons have the longitude/latitude flipped.
(Be sure to fix those otherwise the region intersection code won't work!)

A region file consists of a GEO JSON `Feature` object.
For the `POST /v1/region` operation:

- the `type` and `properties` properties are ignored;

- the `geometry` property is required; and,

- the `igbgd` property must be added:

    - `regionID` - a unique-identifier specified as a dot-separated string of tokens
    
    - `description` - a textual description
    
    - `categories` - an array of categories
