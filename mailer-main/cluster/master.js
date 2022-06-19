const logger = require('drone-ai-logger')({component: 'Mailer - master'})
const driver = require('drone-ai-database')
var cluster = require('cluster');
const { setInterval } = require('timers');
const objectId = require('mongodb').ObjectID

const isProduction = process.env.NODE_ENV === 'production' ? true : false

var numProc = parseInt(process.env.NUM_PROC) || require('os').cpus().length;
var totalShutdown
var messageTasks
var messageTasksBeingProcessed = false;


logger.info(`Master ${process.pid} is running`);

function runWorkers() {

    cluster.setupMaster({
        exec: 'index.js',
    });

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
			}, 500*i) // to avoid making too many connections to DB servers at once
        }

    }


    function restartWorker(obj) {
		!obj ? obj={} : obj=obj // WTF is this?
		delete obj.FIRST_WORKER
        if (totalShutdown !== true) {
            logger.info("Worker is gonna be dead soon. Long live the worker")
            let worker = cluster.fork(obj)
            worker.on('message', messageHandler);
        }
    }
    
    cluster.on('exit', (worker, code, signal) => {
        if (code !== 0 && totalShutdown !== true) {
            
            logger.info('worker failed. starting new one')
            cluster.fork()
            
        }
    });

    cluster.on('message', (worker, msg) => {
        messageHandler(msg)
    });

    function messageHandler(msg) {
        if (msg && msg.contents) {

            switch (msg.contents.code) {
                case "start-up":
                    logger.info(`Worker #${msg.contents.workerID} is starting`)
                    break;
                case "connected-to-db":
                    logger.info(`Worker #${msg.contents.workerID} connected to DB`)
                    break;
                case "web-operational":
                    logger.info(`Worker #${msg.contents.workerID} is serving content`)
                    break;
                case "worker-shutdown":
                    restartWorker()
                    logger.info(`Worker #${msg.contents.workerID} is shutting down`)
                    break;
                case "global-shutdown":
                    logger.info(`Worker #${msg.contents.workerID} requested global shutdown`)
                    totalShutdown = true
                    for (const id in cluster.workers) {
                        setTimeout(() => {
                            //if (!)
                            cluster.workers[id].disconnect()
                        }, 2500);
                    }
                    break;
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
                    
                    break;
            }
        }
    }
}

driver.init((e,db) => {
    if (e) return logger.fatal('Could not connect to DB')
    messageTasks = driver.getCollection('messageTasks')
    messageTasks.createIndex( {creationDate: 1 }, { expireAfterSeconds: 86400 } )
    runWorkers()
    setInterval(checkQueue, 1000, messageTasks)
})

function checkQueue(messageTasks) {
    const lockingTime = 3 // in minutes
    if (messageTasksBeingProcessed) return
    messageTasksBeingProcessed = true
    messageTasks.find({$or:
        [
            {
                locked: null
            },
            { locked: { $lt: new Date().getTime() - lockingTime * 60 * 1000 } }
        ],
        done: null
    }, {limit: 100, sort: {priority: -1}}).toArray((e,o) => {
        if (e) {
            messageTasksBeingProcessed = false
            return logger.error('DB error, could not reade email queue')
        }
        if (!o || !o.length) {
            messageTasksBeingProcessed = false
            return
        }
        const ids = o.map((item) => {
            return objectId(item._id)
        })
        let curTime = new Date().getTime()
        messageTasks.updateMany({_id: {$in: ids}}, {$set: {
            locked: curTime 
            //- (lockingTime - preprocessingLocking) * 60 * 1000 // this will lock tasks for a minute, which should be more than enough
        }}, (err,suc) => {
            if (err) { // unlikely
                messageTasksBeingProcessed = false
                return 
            }
            
            for (let n=0, k=1; n<o.length; n++, k++) {
                let item = o[n];
                item.locked = curTime;
                cluster.workers[k].send({type: item.type || 'email', contents: item})
                if (k > numProc) k = 1
            }
            messageTasksBeingProcessed = false
            return
        })
    })
}