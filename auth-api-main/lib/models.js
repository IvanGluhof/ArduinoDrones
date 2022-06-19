var LocalStrategy = require('passport-local').Strategy,
	JwtStrategy = require('passport-jwt').Strategy;

const objectId = require('mongodb').ObjectID
const cryptoFns = require('./crypto.js')

var isEmail = require("isemail")

const fs = require('fs')
const path = require('path')

const logger = require('drone-ai-logger')({ component: 'Auth models' })

module.exports = () => {

	const databaseDriver = require('drone-ai-database')
	var accounts = databaseDriver.getCollection('accounts')
	var refreshTokens = databaseDriver.getCollection('refreshTokens')

	const jwtPublic = fs.readFileSync(process.env.JWT_PUBLIC_KEY_LOCATION || path.resolve(process.env.HOME + '/certs/jwt.key.pub'))
	var jwtOpts = {
		secretOrKey: jwtPublic,
		issuer: process.env.JWT_ISSUER || 'network',
		audience: process.env.JWT_AUDIENCE || 'network',
		algorithms: ['PS384'],
		//jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
		jwtFromRequest: function (req) {
			function extract(item) {
				const token = item.replace('Bearer ', '')
				return token
			}
			if (req.headers.authorization) {
				return extract(req.headers.authorization)
			}
			if (req.body.authorization) {
				return extract(req.body.authorization)
			}
			if (req.query.authorization) {
				return extract(req.query.authorization)
			}
			return null
		}
	}

	var models = {}
	models.userModel = new LocalStrategy({ usernameField: 'user' },
		function (user, password, done) {
			if (!user || !password) return done(null, false, { message: 'Insufficient data.' });
			accounts.findOneAndUpdate({ $or: [{user: user}, {email: user}] }, {$set: {lastUsed: new Date().getTime()}}, {returnOriginal: false}, function (err, o) {
				if (err) {
					logger.warn(err)
					return done('db-error');
				}
				const document = o.value
				if (!document) {
					return done('account-not-found', false, { message: 'Incorrect username.' });
				}
				if (document.blocked) {
					return done('user-blocked')
				}
				if (!document.activated) {
					return done('user-not-verified')
				}
				cryptoFns.validatePassLocal(password, document.password, function (err, status) {
					if (err) {
						if (err === 'mismatch') return done('pass-mismatch', false, { message: 'Incorrect password.' });
						logger.warn(err)
						return done('crypto-error', false, { message: err });
					}
					
					delete document.password
					return done(null, document)
					

				})
			});
		}
	)
	models.jwtModel = new JwtStrategy(jwtOpts, function (jwt_payload, done) {
		refreshTokens.findOne({ 'payload.payloadId': jwt_payload.payloadId }, function (err, o) {
			if (err) {
				logger.warn(err)
				return done(err, false);
			}
			if (o) {
				if (o.revoked) {
					return done('token-revoked', false)
				}
				return accounts.findOneAndUpdate({ _id: objectId(o.payload.id) }, {$set: {lastUsed: new Date().getTime()}}, {returnOriginal: false}, (e, o) => {
					if (e) {
						logger.warn(e)
						return done(e, false);
					}
					if (o) {
						let user = o.value
						if (user.blocked) {
							return done('user-blocked')
						}
						if (!user.activated) {
							return done('user-not-verified')
						}
						user.refreshTokenId = jwt_payload.payloadId
						return done(null, user)
					}
					return done('account-not-found', false)
				})
			}
			return done('token-not-found', false);
		});
	})

	models.userTemplate = {
		// verify function should return true (if ok), false (if error) or string (if error)
		email: {
			required: true,
			verify: function(email) {
				if (typeof email !== 'string') return false
				const val = isEmail.validate(email, {minDomainAtoms: 2})
				return val
			},
			modify: function(email) {
				return email.toLowerCase()
			}
		},
		user: {
			required: true,
			verify: function(user) {
				if (typeof user !== 'string') return false
				if (user.length > 5) return true;
				return 'username-too-short'
			},
			modify: function(user) {
				return user.toLowerCase()
			}
		},
		password: {
			required: true,
			verify: function(pass) {
				if (typeof pass !== 'string') return false
				if (pass.length > 9) return true
				return 'password-too-short'
			}
		},
		name: {
			required: false,
			verify: function(name) {
				if (typeof name === 'string') return true
				return false
			}
		},
		surname: {
			required: false,
			verify: function(name) {
				if (typeof name === 'string') return true
				return false
			}
		}
	}

	//var rememberMeTokens = databaseDriver.getCollection('rememberMeTokens')
	//rememberMeTokens.createIndex( { creationDate: 1 }, { expireAfterSeconds: 86400 * 30 } ) // remember me tokens will autoexpire and get deleted in 30 days

	//models.rememberMeModel = new RememberMeStrategy(
	//	function(token, done) {
	//		const tokenObjectId = objectId(token)
	//		rememberMeTokens.findOne({_id: tokenObjectId}, function(e, o) {
	//			if (e) { return done(err); }
	//			if (!o) { return done(null, false); }
	//			rememberMeTokens.deleteOne({_id: tokenObjectId }, function(e, o) {
	//				if (e) {
	//					logger.warn('Failed to delete remember me token ' + token)
	//				}
	//			})
	//			accounts.findOne({
	//				_id: objectId(o.userId)
	//			}, (e, user) => {
	//				if (e) { return done(err); }
	//				if (!o) { return done(null, false); }
	//				user.reissueRememberMeToken = true
	//				return done(null, user);
	//
	//			})
	//		});
	//	},
	//	issueRememberMeToken
	//);
	//  
	//function issueRememberMeToken(user, done) {
	//	return cryptoFns.issueRememberMeToken(rememberMeTokens, user, done)
	//}
	//
	//models.issueRememberMeToken = issueRememberMeToken


	return models
}