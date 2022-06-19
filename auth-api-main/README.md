# Auth API

Auth API is a partial layer of abstractions and pre-setup Passport Models to use within our backend microservices.

## Contents

- [Auth API](#auth-api)
  * [Contents](#contents)
  * [How to use](#how-to-use)
    + [Install](#install)
    + [Use inside your microservice](#use-inside-your-microservice)
    + [API](#api)
      - [Required environmental variables](#required-environmental-variables)
      - [Crypto functions](#crypto-functions)
        * [Password-related](#password-related)
          + [`saltAndHash(pass, callback)`](#saltandhashpass-callback)
          + [`generateSalt()`](#generatesalt)
          + [`validatePassLocal(plainPass, hashedPass, callback)`](#validatepasslocalplainpass-hashedpass-callback)
        * [JWT-related](#jwt-related)
          + [`joseSign(data, conf)`](#josesigndata-conf)
          + [`joseVerifyOrDecrypt(data, conf)`](#joseverifyordecryptdata-conf)
        * [Other](#other)
          + [`generateOperationCode()`](#generateoperationcode)
      - [Email functions](#email-functions)
          + [`doTemplate(template, dataset)`](#dotemplatetemplate-dataset)
          + [`sendFromTemplate(document, messageTemplate, callback)`](#sendfromtemplatedocument-messagetemplate-callback)
      - [Models](#models)
      - [User model](#user-model)
      - [Higher-level functionality derived from the aforementioned functions](#higher-level-functionality-derived-from-the-aforementioned-functions)
          + [`verifyAccessToken(token, callback)`](#verifyaccesstokentoken-callback)
          + [`generateJwtToken(data, callback)`](#generatejwttokendata-callback)
          + [`removeRefreshToken(tokenID, callback)`](#removerefreshtokentokenid-callback)
          + [`checkRefreshTokenValidity(tokenID, callback)`](#checkrefreshtokenvaliditytokenid-callback)
          + [`signupUser(data, callback)`](#signupuserdata-callback)
          + [`getProfile(data, callback)`](#getprofiledata-callback)
          + [`hashNewPass(pass, callback)`](#hashnewpasspass-callback)
          + [`updateProfile(id, data, callback)`](#updateprofileid-data-callback)
          + [`allowResetPass(data, resetCode, callback)`](#allowresetpassdata-resetcode-callback)
          + [`allowActivation(data, verificationCode, callback)`](#allowactivationdata-verificationcode-callback)
          + [`sendEmailType(data, messageTemplate, callback)`](#sendemailtypedata-messagetemplate-callback)

## How to use

### Install

In `package.json`:

```json
"dependencies": {
    ...
    "auth-api": "git+https://github.com/drone-ai/auth-api.git",
		...
}
```

Then in terminal: `npm install`

### Use inside your microservice:

```js
const driver = require('drone-ai-database') // see its own documentation
var fyrejet = require('fyrejet')

driver.init((err, db) => {
	if (db) {
		app = fyrejet()
		var passport = require('passport');
		const authApi = require('auth-api')(db)
		authApi.signupUser({ user: 'test_internal', password: '123456789', email: 'test@example.com', activated: true }, (e, o) => { // we will automatically activate user for now
			if (!e) {
				let document = o.ops[0]; // see mongoDB documentation
				return authApi.sendEmailType({ type: 'verification', _id: document._id }, null, (e, o) => {
					if (e) return console.log(e)
					return console.log(o)
				})
			}
			return console.log(e)
		})
		passport.use(authApi.userModel)
		passport.use(authApi.jwtModel)

		passport.serializeUser(function (user, cb) {
			cb(null, user._id);
		});

		passport.deserializeUser(function (id, cb) {
			driver.getCollection('accounts').findOne({ _id: require('mongodb').ObjectID(id) }, (e, o) => {
				if (e) {
					return cb(err);
				}
				return cb(null, o)
			})
		});

		app.use(require('body-parser').urlencoded({ extended: true }));
		app.use(require('body-parser').json());

		app.use(passport.initialize());
		
		app.get('/user/login/', (req, res) => {
			if (req.user) return res.send('logged in')
			return res.send('not logged in')
		})

		app.post('/user/login/',	
			passport.authenticate('local', {
				failWithError: true // passport will return nasty errors we can catch, if auth fails
			}),
			function (req, res) {
				req.user.ip = req.ip
				
				let data = {
					type: 'refresh',
					user: {
						id: req.user._id,
					},
					device: {
						type: 'whatever', // not relevant at this point
						name: 'whatever'
					},
					ip: req.ip
				}
				return authApi.generateJwtToken(data, (e, outData) => {
					if (e) {
						res.statusCode = 500;
						return res.json({
							code: 500,
							status: 'error',
							error: e
						})
					}
					let resData = {
						jwt: outData.payloadSigned,
						expiry: outData.expiryTime
					}
					return res.json({
						code: 200,
						status: 'ok',
						data: resData
					})
				})

			},
			function (err, req, res, next) { // error handling
				res.statusCode = 401
				return res.json({
					code: 401,
					status: 'error',
					error: 'auth-error'
				});
			}
		);

		app.post('/user/generateAccessToken/', passport.authenticate('jwt', { session: false }), (req,res,next) => {
			const data = {
				type: 'access',
				user: req.user,
				refreshTokenId: req.user.refreshTokenId
			}
			authApi.generateJwtToken(data, (e,o) => {
				if (e) {
					let data = {
						code: 500,
						status: 'error',
						error: e
					}
					res.statusCode = 500;
					return res.send(data)
				}
				let data = {
					code: 200,
					status: 'ok',
					data: o
				}
				return res.send(data)
			})
		})

		app.all('*', (req,res, next) => {
			let authHeader = req.headers.authorization ? req.headers.authorization : null
			if (authHeader) authHeader = authHeader.replace('Bearer ', '')
			authApi.verifyAccessToken(authHeader || req.body.token || req.query.token, (e,o) => {
				if (e) {
					res.statusCode = 401
					return res.json({
						code:401,
						status: 'error',
						error: e
					})
				}
				if (o.type === 'access') {
					req.user = o.user;
					return next()
				}
				res.statusCode = 401
				return res.json({
					code: 401,
					status: 'error',
					error: 'refresh-token-provided-instead-of-access-token'
				})
			})
		})

		app.get('/user/profile/', (req,res) => {
			if (!req.query.fromDB || !req.body.fromDB) {
				return res.json(req.user)
			}
		})

		app.listen(3000)
	}
	else {
		throw new Error('No connection could be established. Is DB running?')
	}
})
```



This example does not include password reset or signup verification. See the entirety of API below.



### API

#### Required environmental variables

Auth API requires some environmental variables to be set OR their defaults to be meaningful. To set these environmental variables for Node.JS, you can use  great `dotenv` npm package.

| Name                     | Value                                                        |
| ------------------------ | ------------------------------------------------------------ |
| JWT_PUBLIC_KEY_LOCATION  | Location of a public JWT key (RSA). Defaults to  `~/certs/jwt.key.pub` . `~` is equal to uset home directory, unless HOME environment value is changed. For key generation instructions, check https://gist.github.com/ygotthilf/baa58da5c3dd1f69fae9 |
| JWT_PRIVATE_KEY_LOCATION | Location of a private JWT key (RSA). Defaults to user `~/certs/jwt.key` |
| JWT_AUDIENCE             | Domains for which the JWT keys will be intended. Defaults to `network`. If there are commas (`,`), JWT audience will be split and become an `Array` of possible JWT key audience |
| JWT_ISSUER               | Similar to JWT_AUDIENCE, but designates, which resource(s) signed the JWT |
| MAILER_ADDRESS           | HTTP address of web-mailer service                           |
| MAILER_KEY               | Authentication key (without `Bearer` part) for the mailer    |
| MAILER_FROM              | Email address to send email from. **NEEDS TO BE UNDER OUR CORPORATE EMAIL DOMAIN** or our emails will be deemed as spam |

#### Crypto functions

##### Password-related

###### `saltAndHash(pass, callback)`

Generates salt, then uses scrypt to generate a password-based key derivation (PBKD). Depends on `generarateSalt()`. The resulting PBKD is hopefully returned via callback. Callback needs to have two arguments, `err` and `derivedKey`. The second one is the PBKD itself that should be written to the database instead of user's actual password.

&nbsp;
&nbsp;
&nbsp;

###### `generateSalt()`

Generates and returns salt. This is a blocking, sync function. However, the operation should take a few milliseconds, [unless the system is just booted and system uptime is too low, due to high system entropy being required](https://nodejs.org/api/crypto.html#crypto_crypto_randombytes_size_callback). 

&nbsp;
&nbsp;
&nbsp;

###### `validatePassLocal(plainPass, hashedPass, callback)`

Takes `plainPass` (entered by user during auth), then takes salt from `hashedPass` and rehashes the `plainPass` with the same salt (similarly to `saltAndHash(pass, callback)`). If the hashed `plainPass` matches `hashedPass` it means the user has entered the correct password. 

`callback` follows error-first approach. It should be a function like the following:

```js
function(err,result) {
	if (err) {
		if (err === 'mismatch') return console.log('pass mismatch')// password mismatch
		return console.log('other error')
	}
  return console.log('success')
}
```



The password implementation is based on scrypt. Estimated hardware cost of cracking an 8 char password in 1 year is $4.8M. Since it is highly impractical to spend so much to crack our passwords, this is secure enough for our use case.

Risk of password collision attack appears to be minuscule, since salt is unique for each password. The only realistic threats to account security (by threat level, descending):

1. Staff (could generate new password via `saltAndHash(pass, callback)` and update the password entry in the Database). Could be solved with strict access control to the database (such as slack SSH authorization, logging & etc.)
2. Fishing & scam
3. Poor frontend security

##### JWT-related

###### `joseSign(data, conf)`

`data` - JS object with data payload that you need to sign.

`conf` - optional configuration object. Possible keys are in the table below

| Name      | Value                                                        |
| --------- | ------------------------------------------------------------ |
| header    | `Object` with additional keys that will be added to JWT **`header`**. Usually you don't need to specify it. Read Jose documentation for more info |
| algorithm | Algorithm to be used (`string`). Usually PS384 is used within our microservices. **Change only if you know what you are doing!** |
| expiresIn | Human-friendly designation of when the jwt should expire. Examples: `1 hour`, `2 hours`, `1 month` and so on. |
| now       | JS `Date` object, specifying which time is considered to be current. In other words, the `now` time is considered to be issue (JWT `iss` key ) time. If not provided, `joseSign` will automatically create new `Date` object |

returns signed JWT

&nbsp;
&nbsp;
&nbsp;

###### `joseVerifyOrDecrypt(data, conf)`

`data` - JS object with data payload that you need to sign.

`conf` - optional configuration object. Possible keys are in the table below

| Name       | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| algorithms | Array of algorithms to try. If not specified, fallbacks to `algorithm` key then defaults to ['PS384'] |
| algorithm  | Algorithm to be used (`string`). Usually PS384 is used within our microservices. This will cause `algorithms` key to equal [algorithm]. If `algorithm` contains commas (`,`), then `algorithm` will be split into Array and `algorithms` will equal that Array. |
| typ        | `typ` (no 'e') designated the type of jose token. Defaults to `JWT`, do not change unless you know what you are doing. |

returns decrypted JWT (`data` from` joseSign(data, conf)` with a few additional keys)



##### Other

###### `generateOperationCode()`

Takes no arguments. 

Returns a code with the following pattern: `curTimeInMs` + '__' + `uuidv4()`, 

Where:

`curTimeInMs` is the current time represented in ***milliseconds*** since the start of UNIX era

`uuidv4()` is the function that returns standards-conforming UUID v4 code.

&nbsp;

#### Email functions

###### `doTemplate(template, dataset)`

`template` - an email template `object` that contains HTML template (`html` key) and text-only template (`text` key)

`dataset` - set of data to insert into templates



The `doTemplate` is agnostic to what kinds of data you can insert into template. Here's how it works:

1. First, it looks into what variables the template needs by using regex. The variables are defined as `$__variableName__$`. For instance, if you need some verification code to be in bold, it would look the following way in HTML-template: 

   ```html
   Your verification code is: <b>$__verificationCode__$</b>
   ```

2. The variables are populated into `templateVariables` array. Duplicate variable entries are quickly deleted. (`.sort().filter()` approach)

3. Then, for each variable, we go through the templates and replace them with corresponding key from `dataset` object. For instance, if we use a template from explanation of step 1, `dataset` needs to have `verificationCode` key.



returns template, where all variables have been changed with applicable data

&nbsp;
&nbsp;
&nbsp;

###### `sendFromTemplate(document, messageTemplate, callback)`

`document` - object, containing required data (for instance user's). Similar in nature to `dataset` from `doTemplate(template, dataset)`. Needs to contain `email` key.

`messageTemplate` - object, containing email templating data. Similar in nature to `template` from `doTemplate(template, dataset)`. Needs to contain `subject` key (`string`). Can contain `priority` key (from 1 to 100, with 100 being highest priority), which will help prioritize emails and which defaults to 80. May also contain `attachments` key (`array`), but please refer to Mailer documentation, when it is ready. 

`callback` - standard error-first, response-second callback. If all goes well, response should be any HTTP 2xx status code. If the error argument was `null` or `undefined`, but response is not equal to 2xx status code, it means that error has nonetheless occurred. Current implementation of Mailer should return `202`, but this IS subject to change, so you should probably expect any 2xx status code. You could, for instance, use `const is2xx = parseInt((res/100).toFixed(0)) === 2`, where `res` is response code. Note that `toFixed` returns a string, hence the need to either `parseInt`, use non-strict equality (`==` instead of `===`) OR check for equality with string version of 2  (`'2'`).


&nbsp;

#### Models

Pre-setup models to be used with `passport.js`. Can be used directly.



- userModel - to auth using login and password
- jwtModel - to auth using `refresh JWT token`

You need to study these models yourself from source.

Additional models can be written for individual microservices by developers in charge of their microservices.



#### User model

User model includes keys and validation tests for them, as well as functions that will modify them immediately after validation.

Available as `authApi.userTemplate`

Current keys:

| Key      | Required | Validation     | Modification                  |
| -------- | -------- | -------------- | ----------------------------- |
| email    | true     | email validity | Lowercase                     |
| user     | true     | length > 5     | Lowercase                     |
| password | true     | Length > 9     | Hashing through `saltAndHash` |
| name     | not yet  | Is string?     | no                            |
| surname  | not yet  | Is string?     | no                            |

This is mostly used internally and is provided for reference. However, any account signup or update operation will fail, if any required key is missing.

#### Higher-level functionality derived from the aforementioned functions

These are exposed directly



###### `verifyAccessToken(token, callback)`

`token` - JWT token

`callback` - error-first, result-second callback ( `function(e,o) {}`). If access token verification failed, `e === 'failed-to-verify'`

Sugar around `joseVerifyOrDecrypt(data, conf)`. Useful only for verifying JWT and does not take any settings. 

&nbsp;
&nbsp;
&nbsp;


###### `generateJwtToken(data, callback)`

JWT token generator sugar

`data` - object, keys are specified below. If key is only required for generation of some tokens, that will be specified in "required" column

| Name             | Required                                                     | Value                                                        |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `type`           | Yes                                                          | `"refresh"` or `"access"`. Designates type of token to be generated. For more info, read info below `callback` argument explanation. |
| `user`           | Yes                                                          | should contain user data. Password and verification and password-reset codes are non-essential, so can (and should) be removed from token. Take note that it should contain `_id` key. Since mongoDB maintains `_id` key, you may get it straight from user document. |
| `device`         | Yes, if `type` is `"refresh"`                                | `Object`, containing two keys - `type` ( `string` ) and `name` ( `string` , advised to be device name if possible to retrieve, otherwise User Agent name) |
| `ip`             | Yes, if `type` is `"refresh"`                                | IP address of the client                                     |
| `refreshTokenId` | Yes, if `type` is `"access"` and `webSessionId` is not provided | ID of refresh token. Could be retrieved from `req.user.refreshTokenId` after JWT Refresh Token auth, for example |
| `webSessionId`   | Yes, if `type` is `"access"` and `refreshTokenId` is not provided | Session ID. Could be retrieved with your session middleware. |

`callback` - error-first, result-second callback ( `function(e,o) {}`). 

In the case of `refresh`, the `o` will have the following structure:

```js
{
	type: 'refresh',
	ip: '127.0.0.1',
	user: {//some user data
	},
	device: {}, // device data from the table above
	payload: {
		//you don't really need this data
		id: 'some-user-id',
		type: 'refresh',
		payloadId: 'random uuid v4' // except maybe this in some cases
	},
	revoked: false,
	payloadSigned: 'lot of symbols that appear as nonsense hesb73T762DBHSWQS',
  // payloadSigned IS OUR ACTUAL JWT
	expiryTime: 1234567890 // UNIX Timestamp in seconds when payloadSigned will expire
}
```

In the case of `access`, the `o` will have the following structure:

```js
{
	jwt: 'lot of symbols that appear as nonsense hesb73T762DBHSWQS',
	// OUR ACTUAL JWT
  expires: 1234567890 // UNIX Timestamp in seconds when jwt will expire
}
```



There are two types of tokens - `refresh` and `access`. Refresh tokens are supposed to be generated after initial authentication with login and pass, BUT they are not used to authenticate individual user requests. Instead, access tokens are used, which can be generated by using a refresh token (for mobile platforms) or from session cookie (to be implemented separately on web frontend). This approach allows us to save database requests. We only need to verify identity, when refresh token is generated, or when access token is used to change user's state (such as profile data, user balance, course subscriptions, etc.) In practice, there are many operations for content consumption that would otherwise require constant checks against the database, which would slow our servers down. Additionally, this approach allows to share user data between various domains in a secure way, without risk of interception (interception is meaningless, as JWTs are encrypted and only our personnel has access to the keys)

 
&nbsp;
&nbsp;
&nbsp;


###### `removeRefreshToken(tokenID, callback)`

`tokenID` - refresh tokenID, could be found in access token payload, for instance

`callback` - error-first callback function (`function(e,o)`). Error can be `db-error`. If there's no error, `o` will equal `true`


&nbsp;
&nbsp;
&nbsp;


###### `checkRefreshTokenValidity(tokenID, callback)`

Searches for a valid refresh token with specified ID (with `revoked` being `false`). 

`tokenID` - refresh tokenID, could be found in access token payload, for instance

`callback` - error-first callback function (`function(e,o)`). Error can be `db-error`. If there's no error, `o` will equal `true`


&nbsp;
&nbsp;
&nbsp;


###### `signupUser(data, callback)`

`data` - object, containing at least `user`, `email` and `password` keys.

`callback` - `function(e,o) {}`.

Login and pass should be at least 5 and 9 symbols long (respectively). Email is validated.



Possible errors (`e.message`): 

`'hash-fail'` - possibly system just started and its entropy is too low to generate PBKD using scrypt

`'username-in-use'` - self-explanatory

`'email-in-use'` - self-explanatory

`'bad-email'` - self-explanatory

`'password-too-short'` - self-explanatory

`'username-too-short'` - self-explanatory

Other - database-related errors


&nbsp;
&nbsp;
&nbsp;


###### `getProfile(data, callback)`

`data` - object, containing either `_id`, `user` or `email` key

`callback` - `function(e,o) {}` - style function

`e` is either `'account-not-found'` or database error

`o` is data from user's account


&nbsp;
&nbsp;
&nbsp;


###### `hashNewPass(pass, callback)`

equivalent to crypto functions' `saltAndHash(pass, callback)`


&nbsp;
&nbsp;
&nbsp;


###### `updateProfile(id, data, callback)`

`callback` - `function(e,o) {}` - style function. `e` is an object. If `e` has a key `clientError` that === `true`, it means that error is related to bad data provided by client.

equivalent to mongoDB node js driver's `accounts.findOneAndUpdate({_id: objectId(id)}, {$set: data}, callback)`, where `accounts` is the db collection object. Data is verified internally by this module, prior to DB operations. If `callback`'s `e` has a key `clientError` that === `true`, it means that error is related to bad data provided by client.


&nbsp;
&nbsp;
&nbsp;


###### `allowResetPass(data, resetCode, callback)`

`data` - equivalent to `data` in `getProfile(data, callback)`

`resetCode` - password reset code (`string`)

`callback` - function(e,o) {}

`e` can be database error, `'account-not-found'`, `'no-reset-code'`, `'code-mismatch'`, `'not-valid'` (24 hrs have passed since the issue time)



Checks if user's pass is allowed to be reset with provided reset code. Includes a check that 24 hours have not expired. If everything is ok, password can be changed through combination of `hashNewPass` and `updateProfile`. 


&nbsp;
&nbsp;
&nbsp;


###### `allowActivation(data, verificationCode, callback)`

In principle, works similarly to previous function, but uses different code and instead of `'no-reset-code'`, it can provide `'no-verification-code'` error. If there's no error, it means account can be activated via `updateProfile` (set field `activated` to `true`)


&nbsp;
&nbsp;
&nbsp;


###### `sendEmailType(data, messageTemplate, callback)`

`data` - object with at least one of these keys: `_id`, `email`, `user` AND `type` key which must equal `'verification'` or `'reset'`

`messageTemplate` - template object, same as in email function `sendFromTemplate`

`callback` - same as in email function `sendFromTemplate`, except that errors returned may also include:

`'account-not-found'` and database errors

