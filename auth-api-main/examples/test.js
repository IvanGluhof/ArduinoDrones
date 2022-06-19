const driver = require('drone-ai-database')
var fyrejet = require('fyrejet')

driver.init((err, db) => {
	if (db) {
		app = fyrejet()
		var passport = require('passport');
		const authApi = require('../')(db)
		authApi.signupUser({ user: 'test_internal', password: '123456789', email: 'test@example.com', activated: true }, (e, o) => { // we will automatically activate user for now
			if (!e) {
				console.log('no error')
				console.log(o)
				let document = o.ops[0];
				return authApi.sendEmailType({ type: 'verification', _id: document._id }, null, (e, o) => {
					if (e) return console.log(e)
					return console.log(o)
				})
			}
			return console.log(e)
		})
		passport.use(authApi.userModel)
		//passport.use(authApi.rememberMeModel)
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
		//app.use(require('express-session')({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));

		app.use(passport.initialize());
		//app.use(passport.session());
		//app.use(passport.authenticate('remember-me'));
		
		app.get('/user/login/', (req, res) => {
			if (req.user) return res.send('logged in')
			return res.send('not logged in')
		})
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
					code: err.status || 401,
					status: 'error',
					error: err || 'auth-error'
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