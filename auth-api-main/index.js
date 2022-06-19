const logger = require('drone-ai-logger')({component: 'Auth models'})
const objectId = require('mongodb').ObjectID

require('dotenv').config()

const cryptoFns = require('./lib/crypto.js')
const emailFns = require('./lib/email.js')
const modelsFns = require('./lib/models.js')

module.exports = function(db) {
	if (!db && typeof db !== 'object') { // we need db just to be sure it is initialized
		logger.fatal('No database provided')
	}
	const databaseDriver = require('drone-ai-database')
	var accounts = databaseDriver.getCollection('accounts')
	var refreshTokens = databaseDriver.getCollection('refreshTokens')
	accounts.createIndexes([{
			key: { email: 1 },
			unique: true,
			name: 'email'
		},
		{
			key: { user: 1 },
			unique: true,
			name: 'user'
		},
	])

	refreshTokens.createIndexes( [
		{
			key: {creationDate: 1 }, 
			name: 'creationDate',
			expireAfterSeconds: 1 * 365 * 24 * 60 * 60
		},
		{
			key: {
				revoked: 1
			},
			name: 'revoked'
		}
	] )

	function verifyProfileData(data, nextFn, callback, partialsAllowed, ...nextFnArgs) {
		var arr = Object.keys(exposed.userTemplate)
		for (let n=0; n < arr.length; n++) {
			let key = arr[n];
			if (!data[key]) {
				if (exposed.userTemplate[key].required) {
					if (!partialsAllowed || data[key] === null) {
						let err = new Error(key+'-missing')
						err.clientError = true
						return callback(err)
					}
				}
				continue
			}
			if (exposed.userTemplate[key].verify) {
				const result = exposed.userTemplate[key].verify(data[key])
				
				if (typeof result === 'string') {
					let err = new Error(result)
					err.clientError = true
					return callback(err)
				}
				if (!result) {
					let err = new Error('bad-'+key)
					err.clientError = true
					return callback(err)
				}
			}
			if (exposed.userTemplate[key].modify) {
				data[key] = exposed.userTemplate[key].modify(data[key])
			}
			
		}
		if (data.password) {
			return cryptoFns.saltAndHash(data.password, (err, result) => {
				if (err) return callback(new Error('hash-fail'))
				data.password = result;
				return nextFn(data, callback, ...nextFnArgs)
			})
		}
		return nextFn(data, callback, ...nextFnArgs)
	}

	var exposed = {}

	const models = modelsFns(accounts)

	exposed = Object.assign(exposed, models, emailFns, cryptoFns)

	exposed.verifyAccessToken = function(token, callback) {
		const conf = {
			algorithms: ['PS384']
		}
		const verified = cryptoFns.joseVerifyOrDecrypt(token, conf)
		if (verified) return callback(null, verified)
		return callback('failed-to-verify')
	}

	function generateAccessToken(data, callback) {
		/* data = {
			type: 'access',
			user: {
				// whole user account
			},
			refreshTokenId: 'string'
		} */
		if ( (!data.refreshTokenId && !data.webSessionId) || !data.user || !data.user._id) return callback((!data.refreshTokenId && !data.webSessionId) ? 'refresh-token-is-required' :'user-id-required')
		delete data.user.confidential

		let payload = {
			user: data.user,
			type: 'access'
		}

		function refreshOrSession(data, payload) {
			if (data.refreshTokenId) {
				payload.refreshTokenId = data.refreshTokenId
				return payload
			}
			payload.webSessionId = data.webSessionId
			return payload
		}
		payload = refreshOrSession(data, payload)
		
		const curTime = new Date()
		data.creationDate = curTime
		let config = {
			expiresIn: '15 minutes',
			now: curTime
		}
		const signed = cryptoFns.joseSign(payload, config)
		const millisecondsExpiry = curTime.getTime() + (15 * 60 * 1000)
		const expiryTime = Math.floor( millisecondsExpiry / 1000 )
		const returnData = {
			jwt: signed,
			expires: expiryTime
		}
		return callback(null, returnData)
	}

	function generateRefreshToken(data, callback) {
		/* data = {
			type: 'refresh',
			user: {
				id: 'string',
			},
			device: {
				type: 'smartphone',
				model: 'iPhone 11',
				name: 'Nikolay\'s iPhone'
			},
			ip: '127.0.0.1'
		} */
		if (!data.ip) return callback('device-ip-required')
		if (!data.user) return callback('user-object-required')
		data.payload = {
			id: data.user._id,
			type: 'refresh',
			payloadId: cryptoFns.generateOperationCode()
		}
		if (!data.device) {
			data.device = {
				type: 'unknown',
				name: 'unknown',
			}
		}
		accounts.countDocuments({_id: objectId(data.user._id)}, { limit: 1 }, (e,count) => {
			if (e || count === 0) return callback(e || 'account-not-found')
			const curTime = new Date()
			data.creationDate = curTime
			let config = {
				expiresIn: data.expiresIn || '1 year',
				now: curTime
			}
			const signed = cryptoFns.joseSign(data.payload, config)
			data.payloadSigned = signed
			data.revoked = false
			refreshTokens.insertOne(data, (e,o) => {
				if (e) return callback(e)
				let millisecondsExpiry = curTime.getTime() + (365 * 24 * 60 * 60 * 1000)
				data.expiryTime = Math.floor( millisecondsExpiry / 1000 )
				return callback(null, data)
			})
		})
	}

	exposed.generateJwtToken = function(data, callback) {
		if (!data || !data.type) callback('insufficient-data')
		delete data.user.password
		delete data.user.verificationCode
		delete data.user.resetCode
		if (data.type === 'refresh') {
			return generateRefreshToken(data, callback)
		}
		return generateAccessToken(data, callback)
	}

	exposed.removeRefreshToken = function(tokenID, callback) {
		if (!callback) callback = function(e,o) {
			if (e) logger.warn(e)
			return
		}
		if (!tokenID) callback('token-id-required')
		refreshTokens.findOneAndUpdate({_id: objectId(tokenID)}, {$set: {revoked: new Date() } }, (e,o) => {
			if (e) {
				logger.warn(e)
				return callback('db-error')
			}
			return callback(null, true)
		})
	}

	exposed.checkRefreshTokenValidity = function(tokenID, callback) {
		if (!tokenID) callback('token-id-required')
		refreshTokens.findOne({_id: objectId(tokenID), revoked: false}, (e,o) => {
			if (e) {
				logger.warn(e)
				return callback('db-error')
			}
			if (!o) return callback('token-invalid')
			return callback(null, true)
		})
	}

	exposed.signupUser = function(data, callback) {
		//validation first

		function trySignupUser(data, callback) {


			accounts.findOne({$or: [{
				user: data.user
			},
			{
				email: data.email
			}]}, (e,o) => {
				if (e) {
					return callback(e)
				}
				if (!o) {
					
					return accounts.insertOne(data, (e,o) => {
						if (e) {
							logger.warn(e)
							return callback(e)
						}
						return callback(null,o)
					})
					
				}
				if (o.user === data.user) {
					return callback('username-in-use')
				}
				if (o.email === data.email) {
					return callback('email-in-use')
				}

			})
		}
		
		verifyProfileData(data, trySignupUser, callback, false)
		
	}

	exposed.sendEmailType = function(data, messageTemplate, callback) {
		if (!data.type && (!data.user && !data.email && data._id)) {
			callback('insufficient-data-provided')
		}
		const code = cryptoFns.generateOperationCode()
		let setWhat = {}
		let searchWhat = {$or: [{_id: objectId(data._id)}, {user: data.user}, {email: data.email}]}
		switch (data.type) {
			case 'verification':
				setWhat.verificationCode = code
				searchWhat.activated = false
				if (!messageTemplate || typeof messageTemplate !== 'object') {
					messageTemplate = {
						subject: 'verification code',
						text: 'verification code: $__verificationCode__$', 
						html: 'verification code: <b>$__verificationCode__$</b>'
					}
				}
				break;
			case 'reset':
				setWhat.resetCode = code
				if (!messageTemplate || typeof messageTemplate !== 'object') {
					messageTemplate = {
						subject: 'reset code',
						text: 'reset code: $__resetCode__$', 
						html: 'reset code: <b>$__resetCode__$</b>'
					}
				}
				return sendResetEmail(messageTemplate, setWhat, searchWhat, callback)
			default:
				break;
		}
		if (Object.keys(setWhat).length) {
			return accounts.findOneAndUpdate(searchWhat, {$set: setWhat}, {returnOriginal: false}, (e,o) => {
				if (e) {
					return callback(e)
				}
				if (!o) return callback('account-not-found')
				let document = o.value // document data
				return emailFns.sendFromTemplate(document, messageTemplate, callback)
			})
		}
		return accounts.findOne(searchWhat, (e,o) => {
			if (e) {
				return callback(e)
			}
			if (!o) return callback('account-not-found')
			let document = o
			return emailFns.sendFromTemplate(document, messageTemplate, callback)
		})

	}

	function sendResetEmail(messageTemplate, setWhat, searchWhat, callback) {
		const code = setWhat.resetCode;
		cryptoFns.saltAndHash(setWhat.resetCode, (err, result) => {
			if (err) return callback('hash-fail')
			setWhat.resetCode = result;
			return accounts.findOneAndUpdate(searchWhat, {$set: setWhat}, {returnOriginal: false}, (e,o) => {
				if (e) {
					return callback(e)
				}
				if (!o) return callback('account-not-found')
				let document = o.value // document data
				document.resetCode = code
				return emailFns.sendFromTemplate(document, messageTemplate, callback)
			})
		})
		
	}

	exposed.getProfile = function(data, callback) {
		accounts.findOne({$or: [{_id: objectId(data._id)}, {user: data.user}, {email: data.email}]}, (e,document) => {
			if (e) {
				return callback(e);
			}
			if (!document) {
				return callback('account-not-found')
			}
			return callback(null, document)
		})
	}

	exposed.hashNewPass = function(pass, callback) {
		return cryptoFns.saltAndHash(pass, callback)
	}

	exposed.updateProfile = function(id, data, callback) {
		function update(data, callback) {
			return accounts.findOneAndUpdate({_id: objectId(id)}, {$set: data}, callback)
		}
		verifyProfileData(data, update, callback, true)
		
	}

	exposed.allowActivation = function(data, verificationCode, callback) {
		return exposed.getProfile(data, (e,document) => {
			if (e) return callback(e)
			if (!document.verificationCode) {
				return callback('no-verification-code')
			}
			if (document.verificationCode !== verificationCode) return callback('code-mismatch')
			let requestTime = document.verificationCode.split('__')[0]
			requestTime = parseInt(requestTime)
			const validityPeriod = 24 * 60 * 60 * 1000 // 24 hours in ms
			if (requestTime + validityPeriod >= new Date().getTime()) {
				return callback(null, document)
			}
			return callback('not-valid')
		})
	}

	exposed.allowResetPass = function(data, resetCode, callback) {
		return exposed.getProfile(data, (e,document) => {
			if (e) return callback(e)
			if (!document.resetCode) {
				return callback('no-reset-code')
			}
			return cryptoFns.validatePassLocal(resetCode, document.resetCode, function (err, status) {
				if (err) {
					if (err === 'mismatch') return callback('code-mismatch')
					return callback(err)
				}
				let requestTime = resetCode.split('__')[0]
				requestTime = parseInt(requestTime)
				const validityPeriod = 24 * 60 * 60 * 1000 // 24 hours in ms
				if (requestTime + validityPeriod >= new Date().getTime()) {
					return callback(null, document)
				}
				return callback('not-valid')
			})
			
		})
	}
	
	return exposed
	
}