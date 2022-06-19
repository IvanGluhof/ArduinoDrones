const logger = require('drone-ai-logger')({component: 'Mailer - worker'})
const cluster = require('cluster')
const productInfo = require(process.env.APP_LOCATION + `/productInfo.js`)
const driver = require('drone-ai-database')
var webComponent = require(process.env.APP_LOCATION + `/components/web.js`)
var mailerComponent = require(process.env.APP_LOCATION + `/components/mailer.js`)
var randomTime = process.env.WORKER_RESTART_TIME || Math.floor((Math.random() * 7200000) + 3600000);

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
		var web = new webComponent(productInfo, db)
		web.start()
		var mailer = new mailerComponent()
		mailer.start()
	}
	else {
		logger.fatal('Could not connect to database')
		process.exit(22)
	}
})