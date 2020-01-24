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
