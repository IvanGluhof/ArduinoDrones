# Backend boilerplate

Provides a boilerplate that can be used for our microservices.

Supports JSON HTTP body parsing, urlencoded and includes certain security measures. Please note that it does not sanitize input for known SQL and NoSQL injection vectors, so make sure to validate data yourself or use applicable middleware to mitigate this threat. It also does not provide any rate-limiting, as this is the decision for each microservice's environment and whether it is going to be reverse-proxied by NGINX, as well as other considerations.



For instance, public microservices doing auth and account edits and which are reverse-proxied probably do not need to be accessed more than 5 times in a second by the same user, regardless of whether this user is authorized or not. 

On the other hand, microservices serving course data, content, DRM decryption keys, etc. may need to be accessed more often.



The benefit in using this boilerplate is that you do not need to reinvent the basics and manage cluster workers. Instead, they shutdown cleanly themselves, restart periodically and in case of worker crash, the master respawns the worker. Thus, you only need to deal with your business logic.



## Environmental variables

Can be set with `.env` file and `dotenv` module from NPM

| Name                                        | Value                                          | Required | Notes                                                        |
| ------------------------------------------- | ---------------------------------------------- | -------- | ------------------------------------------------------------ |
| BACKEND_MODULE_LOCATION                     | Location of the module                         | Yes      | Will be set automatically, **DO NOT CHANGE**                 |
| APPLICATION_LOCATION                        | Location of your application components        | Yes      | If not set, boilerplate will attempt to set it automatically |
| NUM_PROC                                    | How many worker processes to use               | No       | If not specified, will create 1 process for each core. Probably needs to be set, if used in Docker containers due to certain Linux kernel bugs |
| NODE_ENV                                    | `production`, `development` or `test`          | No       | If not specified, deemed to be `development`                 |
| WEB_PORT                                    | HTTP(S) port to use                            | No       | Defaults to 8000. Make sure that your microservice uses unique port |
| IP                                          | IP to bind to                                  | No       | Defaults to 0.0.0.0 (all free IPs)                           |
| SSL_KEY_PATH, SSL_CERT_PATH and SSL_CA_PATH | Absolute Location of SSL certificates and keys | No       | SSL_KEY_PATH is for private key, SSL_CERT_PATH is for certificate itself, SSL_CA_PATH is for CA certs. Defaults are (respectively): `~/certs/server.key`, `~/certs/server.crt`, `~/certs/ca.crt` |
| HTTPS_ENABLED                               | Enables SSL                                    | No       | set to `true` to enable. Highly recommended in production    |
| WORKER_RESTART_TIME                         | time of life of each worker in milliseconds    | No       | Each worker has a limited life span to avoid potential problems (code may be crappy, which can leak memory, for instance) |
| USE_EXPRESS                                 | Switches `fyrejet` web-framework for `express` | No       | By default, `fyrejet` framework is used. This environmental variable forces boilerplate to use `express` instead. See `Worker - http extensions` for more information |
| MAX_REQUESTS_PER_WORKER | Integer, see note | No | Maximum number of requests per worker, before worker will try to upscale cluster by asking master to add more workers. Defaults to 1000 |
| MIN_REQUESTS_PER_WORKER | Integer, see note | No | Minimum number of requests per worker, before worker will try to descale cluster by asking master to kill the worker. Defaults to 100. Descaling does NOT affect the only remaining worker. |
| START_WITH_SOLO_WORKER | Any value | No | If set, this will start only one worker, which can then upscale, when reaching `MAX_REQUESTS_PER_WORKER`. |



## Folder structure

A project, depending on this boilerplate may have the following folder structure (please take note that some `.js` files serve only as an example here):

```
http   // files extending http server, for instance with additional routes and middleware
	example1.js
	example2.js
master // files extending master process, for instance if master needs to catch events
	example.js
worker // worker extensions
	example.js
index.js // as expected
package.json // as expected
package-lock.json // as expected
```



## package.json

package.json needs to have an additional key with an object: 

```json
"productInfo": {
    "name": "Drone AI Auth Server",
    "version": "1.0",
    "codename": "Pony"
}
```

This is needed for built-in logger, amongst other uses

## index.js

```js
process.env.APPLICATION_LOCATION = __dirname // this is not required, but recommended
require('dotenv').config()
require('drone-ai-backend')
```

That's it! Please be aware that you should also have installed `dotenv`: `npm install --save dotenv`

## Master extensions

Should be placed in `master` folder. Should export a single function that accepts `logger` object (`Pino`-like):

```js
module.exports = function(logger) {
	// your master logic
}
```

## Worker extensions

Should be placed in `worker` folder. Should export a single function that accepts `logger` object (`Pino`-like):

```js
module.exports = function(logger) {
	// your worker logic
}
```

By the point, when your extension is imported, it is guaranteed that Database driver is initialized. Thus, to access the database you could:

```js
const driver = require('drone-ai-database')
module.exports = function(logger) {
	const db = driver.getDatabase() // but please refer to database-api documentation
}
```

## Worker - http extensions

Similar as above, but gets imported with access to http server and other gooodies :kissing:

```js
module.exports = function(logger, webServer, app, socketIo) {
	// your worker logic
}
```

`webServer` is the underlying implentation of node.js native http server (or its compatible replacement), but you should probably NOT use it

`app` is the web-framework instance that is used by `webServer`. The web-framework used by default is `fyrejet`, which is mostly compatible with `Express` (does not support one method, but provides a replacement), but is much faster (up to 68% faster, without additional optimizations). If you insist on using `Express`, please see USE_EXPRESS environment variable. In either case, refer to `express` and `fyrejet` (if applicable) documentation. The example will be provided below

`socketIo` is a socket.io instance. It's not fully initialized: `var socketIo = require('socket.io')(webServer)`. Please refer to socket.io docs.



#### Using express instead of fyrejet

`index.js` :

```
process.env.APPLICATION_LOCATION = __dirname // this is not required, but recommended
process.env.USE_EXPRESS = true //USE_EXPRESS=true could be put in .env, but it's impractical
require('dotenv').config()
require('drone-ai-backend')
```

That's it.