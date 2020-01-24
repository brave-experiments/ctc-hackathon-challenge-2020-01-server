# igbgd
This repository was cloned from [bat-ledger](https://github.com/brave-intl/bat-ledger) --
there is *many* useful "middleware" components in the [bat-utils directory](tree/master/bat-utils).

# Desktop Installation
You will need to have node, mongodb, and redis on your system.
Then, install all the node packages:

    % npm install

## on MacOS
You will need to have [brew](https://brew.sh/) on your system.
Then run these commands:

    % brew tap mongodb/brew
    % brew install mongodb-community
    % brew services start mongodb/brew/mongodb-community

    % brew install redis
    % brew services start redis

## Configuration
To run locally, create a file called `.env`:

    % cp .env.example .env

Do not worry about any line that starts with `"x"`

The one line you do need to worry about is the definition of `TOKEN_LIST` --
this is a string that must be present in the HTTP header when using the API:

    Authorization: Bearer ...
    
where `"..."` is the value of `TOKEN_LIST`.
You can get a fresh UUIDv4 by going [here](https://www.uuidgenerator.net/),
although depending on your level of caution,
you may choose to generate your own pseudo-random string.

## Running

    npm run start

# Heroku Installation

Create an application:

- `Deploy` using the GitHub method pointing to this repository and the `igbgd` branch.

- Under `Settings` use `heroku/nodejs` for the buildpack.

- Add `Resources` for MongoDB, Redis, and Papertrail (or Timber.io).

- Copy the configuration variables from `.env.example` to `Settings` (except for the lines that starts with `"x"`).

    - The configuration variables for `MONGODB_URI` and `REDIS_URL` are automatically added by Heroku.

    - The configuration variable `HOST` must be set to the Heroku application domain, e.g., `"igbgd.herokuapp.com"`

- Under `Settings` configure the SSL Certificate using "Automatic Certificate Management"

# API

## Create an entry

Supply the `privateID` (a new UUIDv4):

    curl -X POST "http://127.0.0.1:3004/v1/entry" \
      -H "accept: application/json"               \
      -H "Content-Type: application/json"         \
      -H "Authorization: Bearer ..."
      -d "{ \"privateID\"   : \"b2d25937-14f1-48b1-9cf3-7cfeb17b13dd\"
          , \"description\" : \"CEC HQ\"
          , \"category\"    : \"green-iguana\"
          , \"location\"    : { \"longitude\": 19.299706, \"latitude\": -81.381807 }
          , \"image\"       : { \"data\": insert-the-contents-of-documentation/igbgd-base64.txt  }
          }"

Mandatory payload:

- `privateID` must be a new [UUIDv4](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_(random));

- `category` (must be `"green-iguana"`);

- `location.longitude` and  `location.latitude`; and,

- `image.data` must be a [PNG](https://en.wikipedia.org/wiki/Portable_Network_Graphics) file encoded using
[base64](https://en.wikipedia.org/wiki/Base64)


Optional payload:

- `description`

On success,
the server stores the entry and returns the `publicID`:

    {
      "publicID": "77d29272-25c4-4521-ba1a-e33342d8f04b"
    }

The application should persist the `privateID` it creates,
as some operations require this.

The application should also persist the corresponding `publicID` the server creates,
so entries may be displayed as either created by this user or another user.

# Find nearby entries

Supply the geolocation and the radius (e.g., 2000 meters):

    curl -X GET "http://127.0.0.1:3004/v1/entries/circle/2000?longitude=19.348461&latitude=-81.381988"  \
      -H "accept: application/json"                                                                     \
      -H "Authorization: Bearer ..."

Mandatory parameters:

- longitude and latitude; and,

- radius (in meters)

Optional parameters:

- `category` (must be `"green-iguana"`); and,

- `limit` on the number of returned entries (must not exceed 25)

On success,
the server returns an array of entries:

    [
      { "publicID"    : "77d29272-25c4-4521-ba1a-e33342d8f04b"
      , "description" : "CEC HQ"
      , "category"    : "green-iguana"
      , "location"    :
        { "longitude" : 19.299706
        , "latitude"  : -81.381807
        },
      , "image":
         { "data"     : "..."
         , "format"   : "png"
         , "width"    : 64
         , "height"   : 64
        }
      }
    ]

# Retrieve an entry

Supply the `privateID`:

    curl -X GET "http://127.0.0.1:3004/v1/entry/b2d25937-14f1-48b1-9cf3-7cfeb17b13dd" \
      -H "accept: application/json"                                                   \
      -H "Authorization: Bearer ..."

On success,
the server returns that entry:

    { "publicID"    : "77d29272-25c4-4521-ba1a-e33342d8f04b"
    , "description" : "CEC HQ"
    , "category"    : "green-iguana"
    , "location"    :
      { "longitude" : 19.299706
      , "latitude"  : -81.381807
      },
    , "image":
       { "data"     : "..."
       , "format"   : "png"
       , "width"    : 64
       , "height"   : 64
      }
    }

# DELETE an entry

Supply the `privateID`:

    curl -X DELETE "http://127.0.0.1:3004/v1/entry/b2d25937-14f1-48b1-9cf3-7cfeb17b13dd" \
      -H "accept: application/json"                                                      \
      -H "Authorization: Bearer ..."

On success,
the server returns an empty object:

    { }
