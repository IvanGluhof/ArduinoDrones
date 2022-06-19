var path = require('path')
process.env.BACKEND_MODULE_LOCATION = __dirname
var cluster = require('cluster')

require('dotenv').config()

if (cluster.isMaster) require(path.resolve(`${process.env.BACKEND_MODULE_LOCATION}/cluster/master.js`))
else {
	worker = require(path.resolve(`${process.env.BACKEND_MODULE_LOCATION}/cluster/worker.js`))
}