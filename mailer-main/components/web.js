require('http-shutdown').extend();
const path = require('path')
const restana = require('restana')
const bodyParser = require('body-parser');
const logger = require('drone-ai-logger')({component: 'Mailer - worker - web interface'})
const driver = require('drone-ai-database')
const webPort = process.env.WEB_PORT || 8001
const mailerKey = process.env.MAILER_KEY || 'uhWGMbzYrf44MNygr4m6EXm268U7xHC'
const mailerKeyB64 = Buffer.from(mailerKey).toString('base64')
const objectId = require('mongodb').ObjectID


module.exports = function (productInfo) {
	messageTasks = driver.getCollection('messageTasks')

	var webServer
	var app = restana();
	
	app.use(bodyParser.json());

	app.post('*', (req,res, next) => {
		function badAuth() {
			res.send({code:500, status: 'error', error: 'bad-auth'},500)
		}
		var authHeader = req.headers.authorization
		if (authHeader){
			authHeader = authHeader.replace('Bearer ', '')
			
			if (authHeader !== mailerKeyB64) {
				return badAuth()
			}
			return next()
		}
		return badAuth()
	})

	app.post('/email/send/', (req,res) => {
		
		var message = {
			subject: req.body.subject,
			to: req.body.to,
			cc: req.body.cc,
			bcc: req.body.bcc,
			from: req.body.from,
			html: req.body.html,
			text: req.body.text,
			amp: req.body.amp,
			type: 'email',
			priority: req.body.priority || 100,
			entryTime: new Date().getTime(),
			tags: req.body.tags,
			creationDate: new Date()
		}
		if (req.body.attachments && Array.isArray(req.body.attachments)) {
			let attachments = req.body.attachments.filter(item => {
				if (item.encoding === 'base64') return item
				if (item.path.indexOf('data:') === 0 || item.path.indexOf('http:') === 0 || item.path.indexOf('https:') === 0) return item
			})
			message.attachments = attachments
		}
		if (message.priority > 100 || message.priority < 0 || isNaN(message.priority)) message.priority = 100
		messageTasks.insertOne(message, (e,o) => {
			if (!e && o) {
				let result = {
					code: 202,
					status: 'pending',
					messageId: o.insertedId
				}
				return res.send(result, result.code)
			}
			let result = {
				code: 500,
				status: 'error',
				error: e || 'server-error'
			}
			return res.send(result, result.code)
		})
		
	})

	app.post('/email/status/', (req,res) => {
		messageTasks.findOne({type: 'email', _id: objectId(req.body.messageId)}, (e,o) => {
			if (e) return res.send({code:500, status:'error', error: e}, 500)
			if (!o) return res.send({code:404, status:'no-message', error: 'no-message'}, 404)
			if (o.sentInfo && o.done) {
				return res.send({code:200, status:"ok", data: {
					status: 'sent',
					queuedBefore: 0,
					sentInfo: o.sentInfo
				}}, 200)
			}
			if (o.locked > new Date().getTime() - 3 * 60 * 1000) {
				return res.send({code:200, status:"ok", data: {
					status: 'sending',
					queuedBefore: 0
				}}, 200)
			}
			messageTasks.countDocuments({
				entryTime: {$lte: o.entryTime}
			}, (e,count) => {
				if (e) { // no reason to error out completely, we can still send partial information
					return res.send({code:206, status:"partial-info", data: {
						status: 'pending',
						queuedBefore: 'unknown'
					}}, 206)
				}
				return res.send({code:200, status:"ok", data: {
					status: 'pending',
					queuedBefore: count
				}}, 200)
			})
		})
	})

	app.post('/email/find/', (req,res) => {
		messageTasks.find({type: 'email', to: req.body.to, tags: {$in: req.body.tags}}).toArray((e,o) => {
			if (e || !o || !o.length) {
				const code = e ? 500 : 404
				return res.send({code: code, status: 'error', error: e || 'not-found'}, code)
			}
			res.send({code: 200, status: 'ok', data: o || 'not-found'}, 200)
		})
	})

	app.all('*', (req,res) => {
		res.send({
			code: 200,
			status:'ok',
			data: productInfo
		})
	})


	this.stop = function (callback) {
        webServer.shutdown(function(err) {
            if (err) {
                if (callback) {
                    callback(err)
                }
                else{
                    return logger.error('shutdown failed', err.message);
                }
            }
            else {
                logger.info('Web-server is cleanly shutdown.');
                if (callback) {
                    callback(null)
                }
                else {
                    process.exit(0)
                }
            }
            
        });
    }
	
	this.start = function() {
		const ip = process.env.IP || '0.0.0.0'
        if (!process.env.HTTPS_ENABLED || process.env.HTTPS_ENABLED != "true") {
            const http = require('http')
            webServer = http.createServer(app.handle).listen(webPort, ip, function() {
                logger.info('HTTP Server running')
            }).withShutdown();
		}
		else {
			const credentials = {
				key: fs.readFileSync(process.env.SSL_KEY_PATH || path.resolve(process.env.HOME + '/certs/server.key'), 'utf8'), 
				cert: fs.readFileSync(process.env.SSL_CERT_PATH || path.resolve(process.env.HOME + 'certs/server.crt'), 'utf8'),
				ca: [fs.readFileSync(process.env.SSL_CA_PATH || path.resolve(process.env.HOME + 'certs/ca.crt'), 'utf8')], //client auth ca OR cert
			};
			const https = require('https')
			webServer = https.createServer(credentials, app.handle).listen(webPort, ip, function() {
				logger.info('HTTPS Server running')
			}).withShutdown();
		}
	}
	
}