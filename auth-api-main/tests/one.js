var driver = require('drone-ai-database')
var request = require('supertest')
var fyrejet = require('fyrejet')
var db;
var accounts;
var refreshToken
var accessToken
var authApi
var app

describe('drone ai Database driver', function () {
  before(function (done) {
    driver.init((err, db) => {
      if (db) {
        app = fyrejet()
        var passport = require('passport');
        authApi = require('../')(db)
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
        app.use(require('express-session')({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));

        app.use(passport.initialize());
        //app.use(passport.session());
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
              user: {
                _id: req.user._id,
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
              error: 'auth-error',
              'error-details': err
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

        return done()
      }
      else {
        throw new Error('No connection could be established. Is DB running?')
      }
    })
  });

  after(function (done) {
    db.collection('accounts').deleteMany({}, (e, o) => {
      if (!e) {
        return driver.close(() => { done() })
      }
      else {
        return driver.close(() => { done('Failed to delete all documents. Maybe problem with DB connector?') })
      }
    })

  })

  it('should have connected to db successfully', function (done) {
    db = driver.get()
    if (db) return done()
    driver.close()
    throw new Error('No connection could be established. Is DB running?')
  })

  it('should create test user', function (done) {
    authApi.signupUser({ user: 'test_internal', password: '1234567890', email: 'test@example.com', activated: true }, (e, o) => { // we will automatically activate user for now
      if (!e && o.insertedCount) {
        return done()
      }
      return done(e)
    })
  })

  it('should fail to create test user again', function (done) {
    authApi.signupUser({ user: 'test_internal', password: '1234567890', email: 'test@example.com', activated: true }, (e, o) => { // we will automatically activate user for now
      if (e) {
        return done()
      }
      return done('unexpectedly-no-error')
    })
  })

  it('should fail to create test user with short name', function (done) {
    authApi.signupUser({ user: 'test', password: '1234567890', email: 'test@example.com', activated: true }, (e, o) => { // we will automatically activate user for now
      if (e) {
        return done()
      }
      return done('unexpectedly-no-error')
    })
  })

  it('should fail login', function (done) {
    request(app)
      .post('/user/login')
      .expect(401, done)
  })

  it('should login and get refresh token', function (done) {
    request(app)
      .post('/user/login/')
      .set('Content-Type', 'application/json')
      .send('{"user":"test_internal","password":"1234567890"}')
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function (err, res) {
        refreshToken = res.body.data.jwt
        done(err)
      });
  })

  it('should get access token', function (done) {
    request(app)
      .post('/user/generateAccessToken/')
      .set('Content-Type', 'application/json')
      .send(`{"authorization":"Bearer ${refreshToken}"}`)
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function (err, res) {
        accessToken = res.body.data.jwt
        done(err)
      });
  })

  it('should get profile data', function (done) {
    request(app)
      .get(`/user/profile/?token=${accessToken}`)
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function (err, res) {
        if (res.body.user === 'test_internal') return done()
        return done(err || 'mismatch')
      })
  })

})
