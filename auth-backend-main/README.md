# auth-backend
Auth backend is a micro service that implements authentication, signups &amp; everything using backend boilerplate and user api

Based on Drone AI Auth-API && backend microservice boilerplate

## Contents

- [auth-backend](#auth-backend)
  - [Contents](#contents)
  - [Required environmental values](#required-environmental-values)
  - [General HTTP request basics](#general-http-request-basics)
      - [General HTTP Status codes:](#general-http-status-codes-)
      - [Typical response structure:](#typical-response-structure)
        * [200 code](#200-code)
        * [202 code](#202-code)
        * [40x code](#40x-code)
        * [500 code](#500-code)
      - [Common Auth-API Error Values](#common-auth-api-error-values)
  - [General considerations for browser apps](#general-considerations-for-browser-apps)
  - [HTTP paths](#http-paths)
    + [Signup](#signup)
    + [Resend verification](#resend-verification)
    + [Verify email](#verify-email)
    + [Request password reset](#request-password-reset)
    + [Verify password reset code](#verify-password-reset-code)
    + [Password reset](#password-reset)
    + [Login](#login)
        * [Considerations](#considerations)
    + [Generate access token](#generate-access-token)
    + [Get profile data](#get-profile-data)
        * [Without refresh](#without-refresh)
        * [With refresh](#with-refresh)
    + [Update profile data](#update-profile-data)

## Required environmental values

Environmental values can be set with `dotenv` module or via system / shell means.

Requires the same variables as Auth-API:

| Name                     | Value                                                        |
| ------------------------ | ------------------------------------------------------------ |
| JWT_PUBLIC_KEY_LOCATION  | Location of a public JWT key (RSA). Defaults to  `~/certs/jwt.key.pub` . `~` is equal to uset home directory, unless HOME environment value is changed. For key generation instructions, check https://gist.github.com/ygotthilf/baa58da5c3dd1f69fae9 |
| JWT_PRIVATE_KEY_LOCATION | Location of a private JWT key (RSA). Defaults to user `~/certs/jwt.key` |
| JWT_AUDIENCE             | Domains for which the JWT keys will be intended. Defaults to `network`. If there are commas (`,`), JWT audience will be split and become an `Array` of possible JWT key audience |
| JWT_ISSUER               | Similar to JWT_AUDIENCE, but designates, which resource(s) signed the JWT |
| MAILER_ADDRESS           | HTTP address of web-mailer service                           |
| MAILER_KEY               | Authentication key (without `Bearer` part) for the mailer    |
| MAILER_FROM              | Email address to send email from. **NEEDS TO BE UNDER OUR CORPORATE EMAIL DOMAIN** or our emails will be deemed as spam |

AND requires variables from backend boilerplate:

| Name                                        | Value                                          | Required | Notes                                                        |
| ------------------------------------------- | ---------------------------------------------- | -------- | ------------------------------------------------------------ |
| BACKEND_MODULE_LOCATION                     | Location of the module                         | Yes      | Will be set automatically, **DO NOT CHANGE**                 |
| APPLICATION_LOCATION                        | Location of your application components        | Yes      | If not set, boilerplate will attempt to set it automatically. Already set in Auth-backend |
| NUM_PROC                                    | How many worker processes to use               | No       | If not specified, will create 1 process for each core. Probably needs to be set, if used in Docker containers due to certain Linux kernel bugs |
| NODE_ENV                                    | `production`, `development` or `test`          | No       | If not specified, deemed to be `development`                 |
| WEB_PORT                                    | HTTP(S) port to use                            | No       | Defaults to 8000. Make sure that your microservice uses unique port |
| IP                                          | IP to bind to                                  | No       | Defaults to 0.0.0.0 (all free IPs)                           |
| SSL_KEY_PATH, SSL_CERT_PATH and SSL_CA_PATH | Absolute Location of SSL certificates and keys | No       | SSL_KEY_PATH is for private key, SSL_CERT_PATH is for certificate itself, SSL_CA_PATH is for CA certs. Defaults are (respectively): `~/certs/server.key`, `~/certs/server.crt`, `~/certs/ca.crt`, where `~` is user home directory. |
| HTTPS_ENABLED                               | Enables SSL                                    | No       | set to `true` to enable. Highly recommended in production    |
| WORKER_RESTART_TIME                         | time of life of each worker in milliseconds    | No       | Each worker has a limited life span to avoid potential problems (code may be crappy, which can leak memory, for instance) |
| USE_EXPRESS                                 | Switches `fyrejet` web-framework for `express` | No       | By default, `fyrejet` framework is used. This environmental variable forces boilerplate to use `express` instead. See `Worker - http extensions` for more information. Do not set this, as auth-backend is developed and tested with Fyrejet. |







## General HTTP request basics

Send JSON in the body, set `Content-Type` header as `application/json`. Additionally, for future-proofing, set `User-Agent` header as `Drone Control/CLIENT_APP_VERSION (DEVICE_TYPE; OS_TYPE; OS_VERSION; CLIENT_APP_RELEASE_CODENAME; CLIENT_APP_VERSION)` (if you are a native mobile application) or User Browser's User Agent  + `(Drone Control Web Proxy)` (if you are a browser web application)

| Name                        | Meaning                                                      |
| --------------------------- | ------------------------------------------------------------ |
| DEVICE_TYPE                 | `Apple` or `Android`                                         |
| OS_TYPE                     | `iOS` or `Android`                                           |
| OS_VERSION                  | OS version                                                   |
| CLIENT_APP_RELEASE_CODENAME | Client app release codename. Can be any string containing a name of a certain object or concept, for example: `"Zebra"` |
| CLIENT_APP_VERSION          | Full semver-complying app version                            |

#### General HTTP Status codes:

| Code | Meaning                                                      |
| ---- | ------------------------------------------------------------ |
| 200  | OK, you don't even need to parse results, unless otherwise stated |
| 202  | Partial success. Some part of an operation was successful, but a significant aspect was not covered due to a certain error. |
| 400  | Some data is missing or data is bad.                         |
| 401  | Authentication error - user is unauthorized. You don't even need to parse results, unless otherwise stated in the documentation. |
| 404  | Resource not found                                           |
| 500  | Server error. Retry operation in 5-15 seconds                |



#### Typical response structure:

##### 200 code:

```json
{"code":200, "status": "ok"}
```

##### 202 code:

```json
{"code":202, "status": "partial-success", "error": "could-not-send-email"}
```

##### 40x code:

```json
{"code":400, "status": "client-error", "error": "username-missing"}
```

status in this case is always `"client-error"`

##### 500 code:

```json
{"code":500, "status": "server-error", "error": "db-error"}
```

status in this case is always `"server-error"`

Later in this documentation, whenever it is said of 202, 40x or 500 errors, we understand it to be `error` key in the response JSON.



Please take note that there might be other HTTP status codes and HTTP responses may deviate from this structure, due to problems on reverse proxy side.



#### Common Auth-API Error Values

| Error                | Meaning (if needed)                                          |
| -------------------- | ------------------------------------------------------------ |
| `username-too-short` |                                                              |
| `password-too-short` |                                                              |
| `hash-fail`          | Cryptographic failure. There was a problem hashing the password... Usually, it is only possible, when the system `uptime` is too low. Try transaction again in 5-15 seconds |
| `bad-`+`smth`        | The key `smth` was bad                                       |
| `smth`+`-missing`    | The key `smth` is missing                                    |







## General considerations for browser apps

This web-service implies that you store `refresh` JSON web token (JWT) and `access` web token (if you don't know what they are - google) inside your application. That is convenient for mobile applications, but not as obvious with browser apps. You have three options:

1) Implement separate `/user/login/` route. 

- You will need to study this service's `/user/login/` implementation and understand the `req.user` object.
- You can use `express-session` with `connect-mongo` or `connect-mongodb-session` to maintain sessions.
- `express-session` implements `req.session`, which can be extended with your custom data. 
- We won't need refresh JWT. However, when interacting with microservices requiring `access token`, we would need to generate one prior to request, preferably for a short time (no more than 10 minutes). Please refer to auth-api documentation to understand how to generate `access token` . The `access token` could be, stored in session (and thus in database). The better approach, for example, could be to store the token in a separate browser cookie to avoid the need to store it in a database and improve security. 
- We may NOT always need routes to always use `express-session` middleware. We would only need it PRIOR to generating access token.

Pros: Probably easier, `refresh` token NOT needed

Cons: Possibly more database utilization

2) Use this microservice's `/user/login/` route to generate both `refresh` and `access` tokens.

Pros: Less database utilization, reuses existing infrastructure.

Cons: Likely more complicated to implement, since this requires to store both tokens in browser storage (`Cookies` or `LocalStorage`, research their Pros & Cons)



Additionally, there probably needs to be a way to provide an access token from a native mobile app to a browser web app via URL Query String. This might be convenient, if we need to redirect user to some service page (it might . This does not necessarily need to be implemented, but thought of when considering between option 1 & 2.





## HTTP paths

### Signup

Signs the user up and sends verification link and/or code to user email.

How to: `POST` request to `/user/signup/`

Required data: 

| Key      | Required | Value                                 |
| -------- | -------- | ------------------------------------- |
| user     | Yes      | string, no less than 6 characters     |
| password | Yes      | string, no less than 10 characters    |
| email    | Yes      | String, has to be an email ;)         |
| name     | Not yet  | String, has to be First Name          |
| surname  | Not yet  | String, has to be Last Name (surname) |

This list may not be up-to-date, please check auth-api user model docs.

400 errors list:

| Error                                      | Explanation, when neccessary                                 |
| ------------------------------------------ | ------------------------------------------------------------ |
| `username-missing` && `username-too-short` |                                                              |
| `password-missing` && `password-too-short` |                                                              |
| `email-missing`                            |                                                              |
| `hash-fail`                                | There was a problem hashing the password... Usually, it is only possible, when the system `uptime` is too low. Try transaction again in 5-15 seconds |
| `username-in-use`                          |                                                              |
| `email-in-use`                             |                                                              |
| `bad-`+`smth`                              | The client sent an unacceptable value of key `smth`.         |
| `smth`+`-missing`                          | The client did not sent the key `smth`, which was required   |

500 error:

`db-error`. Always. Actual error will be available in console or Slack.

202 error:

`could-not-send-email` - An account was created, BUT verification email could not be sent. Your client app will need to wait 5-15 seconds and ask to resend verification. User does not need to know about it.

Otherwise, if there are no errors, it will be HTTP 200





### Resend verification

Resends verification to user's email, if there's account with the provided user name.

`POST` request to `/user/resend-verification/`

Request body should be JSON containing `email` key.

Possible 400 error: `account-not-found`.

Possible 500 error: `could-not-send-email`.

 Otherwise, if there are no errors, it will be HTTP 200





### Verify email

If you want to verify email from app, you can use this method.

`GET` or `POST` request to `/user/verify/`

If `POST`, request body should be JSON containing `user` or `email` key + `key` key, containing the verification code. E.g., with `curl` command on UNIX-like systems: `curl -X POST -H 'Content-type: application/json' --data '{"key": "1603629504756__ab5e0a91-0587-42f4-a704-96cd43cbf1e0", "email":"test@example.com"}' http://localhost:8000/user/verify/`

If `GET`, you need to use URL Query String like this: `/user/verify/?email=test@example.com&key=1603642754931__44d733cc-304a-442c-bb14-6dc1f9e1b09b`



Possible 400 errors: `['account-not-found', 'no-verification-code', 'code-mismatch', 'not-valid']` `not-valid` is possible, when more than 24 hours have passed since signup. New verification code needs to be sent.

Possible 500 error: `db-error`.





### Request password reset

`GET` or `POST` request to `/user/forgot-pass/`

If `POST`, request body should be JSON containing `email` key

If `GET`, query string should contain `email` parameter



Possible 400 error: `'account-not-found'`

Possible 500 error: `'could-not-send-email'`





### Verify password reset code

`GET` or `POST` request to `/user/verify-reset-code/`

If `POST`, request body should be JSON containing `code` key, `email` key (or `user` key)

If `GET`, query string should contain similar data as query string parameters



Possible 400 errors: `['bad-data', 'insufficient-data', 'account-not-found', 'no-reset-code', 'code-mismatch', 'not-valid', 'failed-to-verify']`

Possible 500 error: `db-error`.





### Password reset

Similar as above, as it uses the same logic, but works as `POST` requests to `/user/reset-pass/`.

Requires additional `pass` key

Additional 500 error: `'hash-fail'`





### Login

`POST` request to `/user/login/`

Send `user` and `password` keys with your JSON.



Possible **401** errors: `['auth-error', 'user-blocked', 'user-not-verified', 'account-not-found', 'pass-mismatch']` . This is **NOT** exhaustive list.

Possible 500 errors: `['crypto-error', 'db-error', 'other-server-error'] `. This is **NOT** exhaustive list.

**N.B.** if you receive `'other-server-error'`, notify maintainer ASAP.

200 response (obviously needs to be parsed): 

```json
{
	"code": 200,
	"status": "ok",
	"data": {
		"jwt": "eyJ0eXAiOiJKV1QiLCJhbGciOiJQUzM4NCIsImtpZCI6IjBpUTB3LU9UbzJ0V1VfTmFSNFpiLWg0R2RZUG1KTjFPakN3cE5SSkhET3MifQ.eyJpZCI6IjVmOTVhNWI3MmFjMzBkMzZhNjZjYmYyNCIsInR5cGUiOiJyZWZyZXNoIiwicGF5bG9hZElkIjoiMTYwMzcxNzEyOTU2OV9fYTc0MjVhZWYtNWQ1Yy00OGI4LWJlOWUtNjc1YWY5MTE3ODBiIiwiYXVkIjoibmV0d29yayIsImlzcyI6Im5ldHdvcmsiLCJpYXQiOjE2MDM3MTcxMjksImV4cCI6MTYzNTI3NDcyOX0.SkDs3VRR2d1tHDsEh0tVg3z_c8gKmmy5zEnXzYL5nKNqmWiEinU6M70tbDnJ7_vhvvgf6ZAasLn4xoXRvxZ3ZXIoyFv3ZLc9SABGprzFg_1Ak3O45kA10CvxNrcNGGxGZfpu6cHcyK5qP2Wbr3VuE2wONEmPyit5pxwlNwNcY-Suj8Wj3ylGg0xw2PL5Vu5AUqzvv2dT8LxXMB-DUOgeEUyzmJ-U71ufn0CTlFoU2KOU7cyVfHqYmgWirwqNfav0JqZExVpi9cF5qohfHqalqX7cwxGg5enAAm72go01n-Yyk6jIV6atnVEmSOH-HOrlEq2ysBezehwKlaYp6O1VRWg_U04ZOnmdMV3As7QmY2sqi0sbMX8gx8wUDG4YgsI1elSYiBV8u2SlnE_cTLkrafOOlOtWykYt3kKDaLUNhzebQzFNkrpAaiHySbcZ5FjSnlRthU1elmZenhhHBO4S14HEkl8cFZwHFzLEyVxoiGd5PNXt_BKiaepYzjOH8SQH0usoKv88nKo7qbbWJwqisdUscz8-eg7cafaBEkxkyDvGBoaI_C1VekUa3ZOrxmdS-bQo8jZoJfwZyQUIWk4Hxmih2nwewQQ-Yy8sOxIvTmuDMoAsHQNWDh_G7cktFNUTdvMtJq4w4IXJTT1Yu181Lo6_FoWsas7Hex9cWJynF8c",
		"expiry": 1635253129
	}
}
```

- `data` key contains our JWT Refresh Token information
  - `jwt` contains JWT Refresh Token itself. It will be needed to generate Access Token
  - `expiry` contains the UNIX Timestamp of the time, when the Refresh Token expires (currently - in a year). In this example, token will expire on 26/10/2021 @ 12:58pm (UTC). After this date, client will need to login again.

##### Considerations:

- ​	JWT Refresh token does not NEED to be changed, if the user changes username or password. 
  - However, in the future, when ability to terminate JWT Refresh token and requirement to enter current password to change are added, it will make sense to immediately generate a new Refresh token and terminate the previous one, when the user changes password
- The only use for Refresh token is to get a time-limited Access token.
- JWT Refresh token is to be treated as a closely guarded secret that should NOT be READ by anything, besides functions designed to get an Access token.







### Generate access token

Access token is needed to access user-only functionality. 

`POST` request to `/user/getAccessToken/`

To get the access token, you need to send your refresh token. There are three ways to do it:

| Transport                                       | Recommended              | How to do it                                                 | Notes                                                        |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Authorization header                            | **Yes**                  | Add a header called `Authorization` with the following value: `Bearer YOUR_REFRESH_TOKEN` | Our services currently do not require `Bearer` to be present in the header, BUT **you still NEED to include it**, so we are compliant with standards. There needs to be a space after `Bearer`. |
| `authorization` key in `POST` request JSON body | Acceptable               | Add a key `authorization` with the following value: `YOUR_REFRESH_TOKEN` | Not always possible, because not all requests will be `POST`. You may optionally add `Bearer`  in the beginning (with a space) |
| Query string                                    | **strongly discouraged** | /some-resource/?authorization=YOUR_REFRESH_TOKEN             | This is strongly discouraged, because there are certain practical URL length limits. For instance, some services may not accept URLs that are longer than 1024-2048 characters. Since Refresh token is itself ~1034 characters long, passing token via query string is a rather bad idea. |

401 errors: `['auth-error', 'user-blocked', 'user-not-verified', 'account-not-found', 'token-not-found']`

500 errors: `['other-server-error']`

**N.B**. if you receive `'other-server-error'`, notify maintainer ASAP.

200 response: 

```json
{
	"code": 200,
	"status": "ok",
	"data": {
		"jwt": "eyJ0eXAiOiJKV1QiLCJhbGciOiJQUzM4NCIsImtpZCI6IjBpUTB3LU9UbzJ0V1VfTmFSNFpiLWg0R2RZUG1KTjFPakN3cE5SSkhET3MifQ.eyJpZCI6IjVmOTVhNWI3MmFjMzBkMzZhNjZjYmYyNCIsInVzZXIiOnsiX2lkIjoiNWY5NWE1YjcyYWMzMGQzNmE2NmNiZjI0IiwidXNlciI6InRlc3RfaW50ZXJuYWwiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJuYW1lIjpudWxsLCJzdXJuYW1lIjpudWxsLCJhY3RpdmF0ZWQiOnRydWUsInJlZnJlc2hUb2tlbklkIjoiMTYwMzcxNzEyOTU2OV9fYTc0MjVhZWYtNWQ1Yy00OGI4LWJlOWUtNjc1YWY5MTE3ODBiIiwiaWQiOiI1Zjk1YTViNzJhYzMwZDM2YTY2Y2JmMjQifSwidHlwZSI6ImFjY2VzcyIsInJlZnJlc2hUb2tlbklkIjoiMTYwMzcxNzEyOTU2OV9fYTc0MjVhZWYtNWQ1Yy00OGI4LWJlOWUtNjc1YWY5MTE3ODBiIiwiYXVkIjoibmV0d29yayIsImlzcyI6Im5ldHdvcmsiLCJpYXQiOjE2MDM3MTk0MzQsImV4cCI6MTYwMzcyMDMzNH0.ohiDKo5rSHeOEpF_ai_adaoM8wbtEW0tzQJr7JSVmpZokNxet5Na72kitgcBv9uFF1RQdfZcUvWsc7NUjtZMF6yx7dRTINCr6eWZPsbQWxNiu2uiUx3rB2klK5zA51ib8C5rhDSSOCtKG_4xg_FK3ZUvAkLgkxI-UP_ArMHmMrTFdBMhovLurp-aSoQ8bwH-SHVBGiTnrhVFjsmZ6oU-tk_9A4wfFpVWQ2GzplD3M3ovOCQzQV4YqOjgKTsSrrtK9aijG88N-GrhubEtWKM-QKqnzGSnpqKPUNMo96jW0SvHeUxnpmAZOkC7TIGkNQuYj6jho8rIxNBeAN31SZoNjouf2ySTbgxLOHsniiB1xu4ONoSUy2wygWYdIYRBA1QotDWs2Qa-RXuQ6VX_wjozMJ251Zi5G_GSeD6u2ny8Z7ucUmGYt_ZRyDOhYifkW1KsE8bu_Gcy30r5bjStR7jfpnqsEvXoExcyrqx_-FelB0Zow_s1Qp9HBi28Kl9qwQXhBs-k6aOln321IiOOcqm5k1dZO2BBfl272Q1KSeWngBZ9EeTdtt1U4rBqpUJiHSY8knyukAi3tsonTWDNN69jK39nwpHB7QEbYWL2BqSn-0og8bys22BE5q-Nqvg74TRQAtmUe6I5nO-wDqWwpeD5eHzLyvWEicYUTNLcoi_Bwwc",
		"expires": 1603720334
	}
}
```

`data` key contains our JWT Access Token information

- `jwt` contains JWT Access Token itself. Note that it looks very similar to Refresh token, but has 324 more characters. This is because Access Token contains user profile data, so keep it **safe**.
- `expiry` contains the UNIX Timestamp of the time, when the Refresh Token expires (currently - in a year). In this example, token will expire on 26/10/2021 @ 12:58pm (UTC). After this date, client will need to login again.





### Get profile data

`GET` request to `/user/profile/`. You need to provide JWT access token. The means to do so are similar to providing refresh token for `/user/getAccessToken/` route.

If no query keys are specified, the server provides data from JWT access token, *which are NOT neccessarily fresh.* It is very fast.

If `refresh` parameter is provided via query string (`/user/profile/?refresh=true`), the user data is retrieved from database, which makes it slower, but 100% accurate.

400 error: `'account-not-found'`

500 error: `'db-error'`

200 results: 

##### Without refresh:

```json
{
	"code": 200,
	"status": "ok",
	"data": {
		"user": {
			"_id": "5f95a5b72ac30d36a66cbf24",
			"user": "test_internal",
			"email": "test@example.com",
			"name": null,
			"surname": null,
			"activated": true,
			"lastUsed": 1603728438273,
			"refreshTokenId": "1603728393600__a0f8aa02-1286-476b-8629-868b1823816b",
			"id": "5f95a5b72ac30d36a66cbf24"
		},
		"fresh": false
	}
}
```

##### With refresh:

```json
{
	"code": 200,
	"status": "ok",
	"data": {
		"user": {
			"_id": "5f95a5b72ac30d36a66cbf24",
			"user": "test_internal",
			"email": "test@example.com",
			"name": null,
			"surname": null,
			"activated": true,
			"lastUsed": 1603728438273
		},
		"fresh": true
	}
}
```



Note that in refresh mode, there's no `id` key (but `_id` key is still available) and there is no `refreshTokenId` key. 





### Update profile data

`POST` request to `/user/profile/`. You need to provide JWT access token. The means to do so are similar to providing refresh token for `/user/getAccessToken/` route.

Table below will show which profile data is changeable:

| Key        | Value                                 | Notes                                                        |
| ---------- | ------------------------------------- | ------------------------------------------------------------ |
| `user`     | `string`, more than 5 characters long |                                                              |
| `email`    | valid email `string`                  |                                                              |
| `password` | `string`, more than 9 characters long | If you change password, you also need the user to provide `oldPass` key. If you don't provide it, the server will return `'no-old-pass'` 400 error |
| `name`     | `string`                              | Not required                                                 |
| `surname`  | `string`                              | Not required                                                 |

You are NOT required to provide data that you don't want to change. In fact, you are currently advised to provide ONLY the data that you want to change to reduce the load on database server.



500 errors: `['db-error', 'other-server-error']`

400 errors: `['no-old-pass', 'account-not-found', 'pass-mismatch']`, as well as Common Auth-API Error Values (see beginning of the document)

200 response is the typical `{"code":200, "status": 'ok'}`. If everything was fine, it is advised to *immediately* request a new Access token with `/user/getAccessToken/`.

