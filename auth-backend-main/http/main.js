var passport = require('passport');

module.exports = function (logger, webServer, app, socketIo) {
	const driver = require('drone-ai-database')
	const db = driver.getDatabase()
	const authApi = require('drone-ai-authapi')(db)

	app.post('/user/signup/', (req,res) => {
		const userData = {
			user: req.body.user,
			password: req.body.password,
			email: req.body.email,
			name: req.body.name,
			surname: req.body.surname,
			activated: false
		}
		if (!userData.user || !userData.password || !userData.email) {
			if (!userData.user) return res.status(400).json({code:400, status: 'client-error', error: 'username-missing'})
			if (!userData.password) return res.status(400).json({code:400, status: 'client-error', error: 'password-missing'})
			if (!userData.email) return res.status(400).json({code:400, status: 'client-error', error: 'email-missing'})
		}
		authApi.signupUser(userData, (e,o) => {
			if (!e) {
				let document = o.ops[0];
				return authApi.sendEmailType({ type: 'verification', _id: document._id }, null, (e, o) => {
					if (e) {
						logger.warn(e)
						return res.status(202).json({code:202, status: 'partial-success', error: 'could-not-send-email'})
					}
					const is2xx = parseInt((o/100).toFixed(0)) === 2
					if (is2xx) return res.status(200).json({code:200, status: 'ok'})
					logger.warn(o)
					return res.status(202).json({code:202, status: 'partial-success', error: 'could-not-send-email'})
				})
			}

			const clientRelatedErrors = ['hash-fail', 'username-in-use', 'email-in-use']
			if (clientRelatedErrors.includes(e) ) {
				return res.status(400).json({code:400, status: 'client-error', error: e})
			}
			if (typeof e === 'object' && e.clientError) {
				return res.status(400).json({code:400, status: 'client-error', error: e.message})
			}
			
			
			logger.warn(e)
			return res.status(500).json({code:500, status: 'server-error', error: 'db-error'})
		})
	})

	app.post('/user/resend-verification/', (req,res) => {
		authApi.sendEmailType({ type: 'verification', email: req.body.email }, null, (e, o) => {
			if (e) {
				if (e === 'account-not-found') {
					return res.status(500).json({code:400, status: 'client-error', error: e})
				}
				logger.warn(e)
				return res.status(500).json({code:500, status: 'server-error', error: 'could-not-send-email'})
			}
			const is2xx = parseInt((o/100).toFixed(0)) === 2
			if (is2xx) return res.status(200).json({code:200, status: 'ok'})
			logger.warn('could-not-send-email')
			return res.status(500).json({code:500, status: 'server-error', error: 'could-not-send-email'})
		})
	})

	var verifyEmail = (req,res) => {
		
		function searchFormer() {
			const search = {}
			const user = req.query.user || req.body.user
			if (user) {
				search.user = user
				return search
			}
			search.email = req.query.email || req.body.email
			return search
		}
		
		const key = req.query.key || req.body.key
		
		authApi.allowActivation(searchFormer(), key, (e,o) => {
			
			if (e) {
				const clientRelatedErrors = ['account-not-found', 'no-verification-code', 'code-mismatch', 'not-valid']
				if (clientRelatedErrors.includes(e)) {
					return res.status(400).json({code:400, status: 'client-error', error: e})
				}
				logger.warn(e)
				return res.status(500).json({code:500, status: 'server-error', error: 'db-error'})
			}
			const id = o._id
			return authApi.updateProfile(id, {activated: true, verificationCode: null}, (err, result) => {
				if (err) {
					logger.warn(err)
					return res.status(500).json({code:500, status: 'server-error', error: 'db-error'})
				}
				return res.status(200).json({code:200, status: 'ok'})
			})

		})
	}

	app.get('/user/verify/', verifyEmail)
	app.post('/user/verify/', verifyEmail)

	var requestPassReset = (req,res) => {
		const email = req.query.email || req.body.email
		return authApi.sendEmailType({ type: 'reset', email: email }, null, (e, o) => {
			if (e) {
				if (e === 'account-not-found') return res.status(400).json({code:400, status: 'client-error', error: e})
				logger.warn(e)
				return res.status(500).json({code:500, status: 'server-error', error: 'could-not-send-email'})
			}
			const is2xx = parseInt((o/100).toFixed(0)) === 2
			if (is2xx) return res.status(200).json({code:200, status: 'ok'})
			return res.status(500).json({code:500, status: 'server-error', error: 'could-not-send-email'})
		})
	}

	app.get('/user/forgot-pass/', requestPassReset)
	app.post('/user/forgot-pass/', requestPassReset)

	function resetGenHashPassAndUpdate(req,res,next) {

		authApi.updateProfile(res.locals.documentId, {password: res.locals.pass, resetCode: null}, (err, result) => {
			if (err) {
				if (err.message === 'hash-fail') {
					logger.warn(err)
					return res.status(500).json({code:500, status: 'server-error', error: err.message})
				}
				if (err.clientError) {
					return res.status(400).json({code:400, status: 'client-error', error: err.message})
				}
				logger.warn(err)
				return res.status(500).json({code:500, status: 'server-error', error: 'db-error'})
			}
			return res.status(200).json({code:200, status: 'ok'})
		})
		
	}
	
	function resetPassCheck (req,res, next) {
		
		const code = req.query.code || req.body.code
		const email = req.query.email || req.body.email
		const user = req.query.user || req.body.user
		const pass = req.body.pass
		if (typeof code !== 'string' || (email && typeof email !== 'string') || (user && typeof user !== 'string') || (pass && typeof pass !== 'string')) {
			return res.status(400).json({code:400, status: 'client-error', error: 'bad-data'})
		}
		if (!code || (!email && !user) || (!res.locals.verifyOnly && !pass)) {
			return res.status(400).json({code:400, status: 'client-error', error: 'insufficient-data'})
		}
		const data = {
		}
		user ? data.user = user : data.email = email
		
		authApi.allowResetPass(data, code, (e,o) => {
			if (e) {
				const nonDbErrs = ['account-not-found', 'no-reset-code', 'code-mismatch', 'not-valid']
				if (nonDbErrs.includes(e)) return res.status(400).json({code:400, status: 'client-error', error: e})
				logger.warn(e)
				return res.status(500).json({code:500, status: 'server-error', error: 'db-error'})
			}
			if (res.locals.verifyOnly) return res.status(200).json({code:200, status: 'ok'})
			res.locals.documentId = o._id // we need to remember ID to update user account
			res.locals.pass = pass
			return resetGenHashPassAndUpdate(req,res,next) // next function will deal with it. This is for readability, although we get a bit of perfomance hit.
		})
	}

	app.get('/user/verify-reset-code/', (req,res,next) => {
		res.locals.verifyOnly = true;
		return next()
	}, resetPassCheck)

	app.post('/user/verify-reset-code/', (req,res,next) => {
		res.locals.verifyOnly = true;
		return next()
	}, resetPassCheck)

	app.post('/user/reset-pass/', resetPassCheck)


	// we move passport, because we don't need it any earlier
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

	app.use(passport.initialize());

	app.post('/user/login/',
		passport.authenticate('local', {
			// failureRedirect: '/login'
			//, session: true 
			failWithError: true
		}),
		function (req, res) {
			req.user.ip = req.ip

			let data = {
				type: 'refresh',
				user: req.user,
				device: {
					type: 'whatever', // not relevant at this point
					name: 'whatever'
				},
				ip: req.ip
			}
			return authApi.generateJwtToken(data, (e, outData) => {
				if (e) {
					res.statusCode = 500;
					logger.warn(e)
					return res.json({
						code: 500,
						status: 'server-error',
						error: 'other-server-error'
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
			if (err === 'crypto-error' || err === 'db-error') {
				logger.warn(err)
				res.statusCode = 500
				return res.json({
					code: 500,
					status: 'server-error',
					error: err
				});
			}
			res.statusCode = 401
			return res.json({
				code: err.status || 401,
				status: 'client-error',
				error: err.message || err || 'auth-error'
			});
		}
	);

	app.post('/user/getAccessToken/', passport.authenticate('jwt', { session: false, failWithError: true }), (req, res, next) => {
		const data = {
			type: 'access',
			user: req.user,
			refreshTokenId: req.user.refreshTokenId
		}
		authApi.generateJwtToken(data, (e, o) => {
			if (e) {
				logger.warn(e)
				let data = {
					code: 500,
					status: 'server-error',
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
	},
	function (err, req, res, next) { // error handling
		if (typeof err === 'object') {
			logger.warn(err)
			res.statusCode = 500
			return res.json({
				code: 500,
				status: 'server-error',
				error: 'other-server-error'
			});
		}
		res.statusCode = 401
		return res.json({
			code: err.status || 401,
			status: 'client-error',
			error: err || 'auth-error'
		});
	})

	function verifyAuth(req,res,next) {
		let authHeader = req.headers.authorization ? req.headers.authorization : null
		if (authHeader) authHeader = authHeader.replace('Bearer ', '')
		authApi.verifyAccessToken(authHeader || req.body.token || req.query.token, (e, o) => {
			if (e) {
				res.statusCode = 401
				return res.json({
					code: 401,
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
	}

	app.get('/user/profile/', verifyAuth, (req, res) => {
		if (!req.query.refresh) {
			return res.json({code:200, status: 'ok', data: {
				user: req.user,
				fresh: false
			}})
		}
		authApi.getProfile(req.user, (e,o) => {
			if (e) return res.status(500).json({code:500, status: 'server-error', error: 'db-error'})
			if (!o) return res.status(400).json({code:400, status: 'client-error', error: 'account-not-found'})
			delete o.password;
			delete o.resetCode;
			delete o.verificationCode;
			return res.json({code:200, status: 'ok', data: {
				user: o,
				fresh: true
			}})
		})
	})

	app.post('/user/profile/', verifyAuth, (req,res, next) => {
		var userKeysInTemplate = Object.keys(authApi.userTemplate);
		const userUpdateData = Object.assign({}, req.body)
		var userKeys = Object.keys(userUpdateData)
		userKeys.forEach(key => {
			if (!userKeysInTemplate.includes(key)) delete userUpdateData[key]
			return
		})
		if (userUpdateData.password) { // checks if user tries to change pass
			if (!req.body.oldPass) return res.status(400).json({code:400, status: 'client-error', error: 'no-old-pass'}) // old pass not specified
			return authApi.getProfile(req.user, (e,o) => {
				if (e) return res.status(500).json({code:500, status: 'server-error', error: 'db-error'})
				if (!o) return res.status(400).json({code:400, status: 'client-error', error: 'account-not-found'})
				const oldPassHashed = o.password
				return authApi.validatePassLocal(req.body.oldPass, oldPassHashed, function (err, status) {

					if (err) {
						if (err === 'mismatch') return res.status(400).json({code:400, status: 'client-error', error: 'pass-mismatch'})
						logger.warn(err)
						return res.status(500).json({code:500, status: 'server-error', error: 'other-server-error'})
					}

					res.locals.userUpdateData = userUpdateData
					return next()
				})
			})
		}
		res.locals.userUpdateData = userUpdateData
		return next()
		
	}, (req,res) => {
		authApi.updateProfile(req.user._id, res.locals.userUpdateData, (err, result) => {
			if (err) {
				if (err.clientError) {
					return res.status(400).json({code:400, status: 'client-error', error: err.message})
				}
				logger.warn(err)
				return res.status(500).json({code:500, status: 'server-error', error: 'db-error'})
			}
			return res.status(200).json({code:200, status: 'ok'})
		})
	})

	app.all('*', (req, res) => {
		return res.status(404).json({code:404, status: 'error', error: 'not-found'})
	})

}