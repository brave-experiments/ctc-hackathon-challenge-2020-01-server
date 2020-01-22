# igbgd
This repository was cloned from [bat-ledger](https://github.com/brave-intl/bat-ledger).
The reason is that there is much useful "middleware" in the [bat-utils directory](tree/master/bat-utils).

# Installation
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

# Configuration
To run locally, create a file called `.env`:

    % cp .env.example .env

Do not worry about any line that starts with `"x"`

The one line you do need to worry about is the definition of `TOKEN_LIST` --
this is a string that must be present in the HTTP header when creating a new entry:

    Authorization: Bearer ...
    
where `"..."` is the value of `TOKEN_LIST`.
You can get a fresh UUID by going [here](https://www.uuidgenerator.net/).

# Running

    npm run start
