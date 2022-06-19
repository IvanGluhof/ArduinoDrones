require('http-shutdown').extend();
const path = require('path')
const fyrejet = require('fyrejet')
const express = require('express')
const bodyParser = require('body-parser');
const helmet = require('helmet');

const downscalingHttpReqs = parseInt(process.env.MIN_REQUESTS_PER_WORKER) || 100
const upscalingHttpReqs = parseInt(process.env.MAX_REQUESTS_PER_WORKER) || 1000
var upscalingCount = 0
var downscalingCount = 0
var httpRequestsMade = 0

var timer = setInterval(() => {
	if (httpRequestsMade > upscalingHttpReqs) {
		if (upscalingCount > 2) {
			upscalingCount = 0;
			httpRequestsMade = 0;
			return sendToMaster({
				contents: {
					code: 'upscale'
				}
			});
		}
		upscalingCount = upscalingCount + 1
		return
	}
	if (httpRequestsMade < downscalingHttpReqs) {
		if (downscalingCount > 10) {
			downscalingCount = 0;
			return sendToMaster({
				contents: {
					code: 'downscale'
				}
			});
		}
		downscalingCount = downscalingCount + 1
		return
	}

	httpRequestsMade = 0;
	downscalingCount = 0;
	upscalingCount = 0;
}, 1500)

process.on('disconnect', () => { 
	clearTimeout(timer)
})

module.exports = function (productInfo) {

	const logger = require('drone-ai-logger')({component: productInfo.name + ' - worker - web component'})
	
	var webServer
	var socketIo
	var app
	if (process.env.USE_EXPRESS) app = express();
	else app = fyrejet();

	app.enable('strict routing');
    app.set('trust proxy', true)
	app.set('case sensitive routing', true);
	
	app.set('port', process.env.WEB_PORT || 8000);

	app.use(helmet({
		hsts: false,
		hidePoweredBy: false
	}));
	
	app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

	this.stop = function (callback) {
        webServer.shutdown(function(err) {
            if (err) {
                if (callback) {
                    callback(err)
                }
                else{
                    return console.log('shutdown failed', err.message);
                }
            }
            else {
                console.log('Web-server is cleanly shutdown.');
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
            webServer = http.createServer(app).listen(app.get('port'), ip, function() {
                logger.info('HTTP Server running')
			}).withShutdown();
			webServer.on('request', () => {
				httpRequestsMade = httpRequestsMade + 1;
			})
			socketIo = require('socket.io')(webServer)
		}
		else {
			const credentials = {
				key: fs.readFileSync(process.env.SSL_KEY_PATH || path.resolve(process.env.HOME + '/certs/server.key'), 'utf8'), 
				cert: fs.readFileSync(process.env.SSL_CERT_PATH || path.resolve(process.env.HOME + '/certs/server.crt'), 'utf8'),
				ca: [fs.readFileSync(process.env.SSL_CA_PATH || path.resolve(process.env.HOME + '/certs/ca.crt'), 'utf8')], //client auth ca OR cert
			};
			const https = require('https')
			webServer = https.createServer(credentials, app).listen(app.get('port'), ip, function() {
				logger.info('HTTPS Server running')
			}).withShutdown();
			webServer.on('request', () => {
				httpRequestsMade = httpRequestsMade + 1;
			})
			socketIo = require('socket.io')(webServer)
		}
	}
	

	if (process.env.NODE_ENV === 'test') {
		require(__dirname + '/test.js')(app)
	}
	if (process.env.APPLICATION_LOCATION) {
		var normalizedPath = path.join(process.env.APPLICATION_LOCATION, "http");
		let dirList
		try {
			dirList = require("fs").readdirSync(normalizedPath)
		}
		catch(e) {
			logger.info('no worker-http extensions')
		}
		if (dirList) {
			dirList.forEach(function(file) {
				if (file.match(/\.js$/) !== null && file !== 'index.js') {
					require(path.join(process.env.APPLICATION_LOCATION, 'http', file)) (logger, webServer, app, socketIo)
				}
			});
		}
		
	}
	app.get('/', (req,res) => {
		return res.json({
			code: 200,
			status:'ok',
			data: productInfo
		})
	})
	
}