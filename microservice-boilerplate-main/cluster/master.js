const { RateLimiterClusterMaster } = require('rate-limiter-flexible');
var cluster = require('cluster')
const path = require('path')
const defailtProductInfo = require(`${process.env.BACKEND_MODULE_LOCATION}/productInfo.js`)

var productInfo;

productInfo = defailtProductInfo
if (process.env.APPLICATION_LOCATION) {
	const package = require(path.join(process.env.APPLICATION_LOCATION, 'package.json'))
	if (package.productInfo) {
		productInfo = package.productInfo
	}
}

const logger = require('drone-ai-logger')({component: productInfo.name + ' - master'})
process.title = productInfo.name

const isProduction = process.env.NODE_ENV === 'production' ? true : false
const downscalingHttpReqs = parseInt(process.env.MIN_REQUESTS_PER_WORKER) || 2500
const upscalingHttpReqs = parseInt(process.env.MAX_REQUESTS_PER_WORKER) || 5000
const scaleObj = {}

var numProc = parseInt(process.env.NUM_PROC) || require('os').cpus().length;
var totalShutdown

logger.info(`Master ${process.pid} is running`);

function runWebWorkers() {
    new RateLimiterClusterMaster();

    cluster.setupMaster({
        exec: 'index.js',
    });

    if (process.env.START_WITH_SOLO_WORKER) {
        cluster.fork()
    }
    else {
        for (let i = 0; i < numProc; i++) {
            if (!isProduction) {
                logger.info('Spawning worker process')
            }
            if (i === 0) {
                cluster.fork({FIRST_WORKER: true})
            }
            else{
		    	setTimeout(() => {
		    		cluster.fork()
		    	}, 100*i) // to avoid making too many connections to DB servers at once
            }
        }
    }

    if (process.env.APPLICATION_LOCATION) {
        var normalizedPath = path.join(process.env.APPLICATION_LOCATION, "master");
        let dirList
        try {
			dirList = require("fs").readdirSync(normalizedPath)
		}
        catch(e) {
            logger.info('no master extensions')
        }
        if (dirList) {
            dirList.forEach(function(file) {
                if (file.match(/\.js$/) !== null && file !== 'index.js') {
                  require(path.join(process.env.APPLICATION_LOCATION, 'master', file)) (logger)
                }
            });
        }
    }


    function restartWorker() {
        if (totalShutdown !== true) {
            logger.info("Worker is gonna be dead soon. Long live the worker")
            let worker = cluster.fork()
        }
    }
    
    cluster.on('exit', (worker, code, signal) => {
        if (code !== 0 && totalShutdown !== true) {
            
            logger.info('worker failed. starting new one')
            cluster.fork()
            
        }
    });

    cluster.on('message', (worker, msg) => {
        messageHandler(msg, worker)
    });

    function messageHandler(msg, worker) {
        if (msg && msg.contents) {

            switch (msg.contents.code) {
                case "start-up":
                    logger.info(`Worker #${msg.contents.workerID} is starting`)
                    return;
                case "connected-to-db":
                    logger.info(`Worker #${msg.contents.workerID} connected to DB`)
                    return;
                case "web-operational":
                    logger.info(`Worker #${msg.contents.workerID} is serving content`)
                    return;
                case "worker-shutdown":
                    restartWorker()
                    logger.info(`Worker #${msg.contents.workerID} is shutting down`)
                    return;
                case "global-shutdown":
                    logger.info(`Worker #${msg.contents.workerID} requested global shutdown`)
                    totalShutdown = true
                    for (const id in cluster.workers) {
                        setTimeout(() => {
                            //if (!)
                            cluster.workers[id].disconnect()
                        }, 2500);
                    }
                    return;
                case "restart-request":
                    restartInProgress = true
                    logger.info(`Worker #${msg.contents.workerID} requested global workers restart`)
                    for (const id in cluster.workers) {
                        cluster.workers[id].disconnect()
                        let timeout = setTimeout(() => {
                            if (cluster.workers[id]) {
                                cluster.workers[id].kill();
                            }   
                        }, 7500);
                    }
                    
                    return;
                case "upscale":
                    if (Object.keys(cluster.workers).length < numProc) return cluster.fork()
                    return;
                case "downscale":
                    if (Object.keys(cluster.workers).length > 1) return cluster.workers[msg.contents.workerID].disconnect()
                    return;
                default:
                    return;
            }
        }
        return
    }
}


runWebWorkers()