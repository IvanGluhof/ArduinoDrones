const cluster = require('cluster')
const path = require('path')
const defailtProductInfo = require(process.env.BACKEND_MODULE_LOCATION + `/productInfo.js`)
const driver = require('drone-ai-database')
var httpComponent = require(process.env.BACKEND_MODULE_LOCATION + `/components/http.js`)
var randomTime = process.env.WORKER_RESTART_TIME || Math.floor((Math.random() * 7200000) + 3600000);

var productInfo;

productInfo = defailtProductInfo
if (process.env.APPLICATION_LOCATION) {
	const package = require(path.join(process.env.APPLICATION_LOCATION, 'package.json'))
	if (package.productInfo) {
		productInfo = package.productInfo
	}
}

const logger = require('drone-ai-logger')({component: productInfo.name + ' - worker'})
  

process.title = productInfo.name

global.sendToMaster = function(obj,cb) { // so it is available in other app parts
	if (typeof obj === 'string') {
		obj = {
			contents: {
				code: obj
			}
		}
	}
	if (!cb) {
		cb = function(e) {
			if (e) logger.warn(e)
		}
	}
	
	obj.contents.workerID = cluster.worker.id
	if (process.connected) {
		return process.send(obj,cb)
	}
	
	return cb('IPC Channel seems to be closed already, ignoring sendToMaster')
		
}

sendToMaster({
    contents: {
        code: 'start-up',
    }
});

function gracefulClose(database, unclean) {
	if (unclean) {
		try {
			process.disconnect()
		}
		catch(e){}
		
		setTimeout(() => {
			process.exit(24)
		}, 3000)
	}
	sendToMaster({
		contents: {
			code: 'worker-shutdown',
		}
	});
		
	database.close(function (err, o) {
		if (err) {
			console.log('Database is NOT cleanly shutdown.');
			return process.exit(22)
		}
		
		console.log('Database is cleanly shutdown.');
		//setTimeout(process.exit, 30000)
		if (!unclean) return process.exit(0)
		return process.exit(25)
		
	})
		
}

driver.init((err, db) => {
	if(!err && db) {
		
		sendToMaster({
			contents: {
				code: 'connected-to-db',
			}
		});
		logger.info("I will restart in around " + Math.round(randomTime / 60000) + " minutes")
		var http = new httpComponent(productInfo, db)
		http.start()
		setTimeout(gracefulClose, randomTime, db);
        process.on('disconnect', () => {
            gracefulClose(db);
		});
		process.once('uncaughtException', (err, origin) => {
			logger.fatal({err, origin})
			return gracefulClose(db, true);
		});
		process.once('unhandledRejection', (reason, promise) => {
			logger.fatal({reason, promise})
			return gracefulClose(db, true);
		  })
		if (process.env.APPLICATION_LOCATION) {
			var normalizedPath = path.join(process.env.APPLICATION_LOCATION, "worker");
			let dirList
        	try {
				dirList = require("fs").readdirSync(normalizedPath)
			}
			catch(e) {
				logger.info('no worker extensions')
			}
			if (dirList) {
				dirList.forEach(function(file) {
					if (file.match(/\.js$/) !== null && file !== 'index.js') {
					  require(path.join(process.env.APPLICATION_LOCATION, 'master', file)) (logger)
					}
				});
			}
		}
	}
	else {
		logger.fatal('Could not connect to database')
		process.exit(22)
	}
})