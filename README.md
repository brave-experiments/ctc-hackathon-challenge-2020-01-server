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

The one line that **you do need to worry about** is the definition of `TOKEN_LIST` --
this string contains one or more access-tokens separated by commas.
One of these values must be present in the HTTP header when using the API:

    Authorization: Bearer ...
    
where `"..."` is the value of `TOKEN_LIST`.
The best current practice is to generate one or more newly-generated UUIDv4 values,
and use those.
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

# Authorization
End-users are "authenticated" by including one of the comma-separated tokens from `TOKEN_LIST`.

## Administrative Website
The server provides website access to authenticated administrators.
Access is determined based on administrative roles.

The administrative website is located at `https://{HOST}/v1/login` where `{HOST}` is the value used in the Heroku settings.
Once 

## Administrator Authentication
Administrators are authenticated by using GitHub OAuth:

- Login to your GitHub organizational account
- Click on `Settings`
- Click on `OAuth Apps`
- Click on `New OAuth App`
- Set the `Application Name`, `Homepage URL`, and `Applicatino Description`
- Set the `Authorization callback URL` to be `https://{HOST}/v1/login` where `{HOST}` is the value used in the Heroku settings
- Click on `Register application`
- On success, the resulting page will contain the `Client ID` and `Client Secret`
- To bring extra joy to your administrators,
you may want to set the `Application logo` -- the file [igbgd](blob/igbgd/igbgd/assets/igbgd.png) is a good start.

Now go back to the Heroku `Settings` page for your application and add these configuration variables:

- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SET` from the GitHub application you created
- `GITHUB_FORCE_HTTPS` to `true`
- `GITHUB_LOGIN_BYE` the URL where administrators are redirected when they logout from the Administrator site
- `GITHUB_LOGIN_WORLD` to `/igbgd`
- `GITHUB_ORG` the name of your GitHub organizational account
- `IRON_KEYPASS` another pseudo-random string, e.g., a newly-generated UUIDv4 value
- `MAPBOX_TOKEN`: your API key at [mapbox](https://mapbox.com)

## Administrator Roles
Administrators are assigned roles by using GitHub Teams:

- Login to your GitHub organizational account
- Click on `Teams`
- Click on `New team` to create the `readonly` role
- Once created, add team members
- Repeat for the `devops` and `reviewer` role

## Access Control
| Method | Resource                       | Authorization | Administrator Role            |
|--------|--------------------------------|---------------|-------------------------------|
| GET    | /v1/entries/{shape}/{region}   | token         | n/a                           |
| | | | |
| POST   | /v1/entry                      | token         | n/a                           |
| GET    | /v1/entry/{privateID}          | token         | n/a                           |
| PUT    | /v1/entry/{privateID}          | token         | n/a                           |
| DELETE | /v1/entry/{privateID}          | token         | n/a                           |
| | | | |
| GET    | /v1/entry/{privateID}/regions  | session       | devops, readonly, or reviewer |
| | | | |
| POST   | /v1/region                     | session       | devops                        |
| GET    | /v1/region/{regionID}          | session       | devops, readonly, or reviewer |
| PUT    | /v1/region/{regionID}          | session       | devops                        |
| DELETE | /v1/region/{regionID}          | session       | devops                        |
| | | | |
| GET    | /v1/region/{regionID}/entries  | session       | devops, readonly, or reviewer |
