var path = require('path')
process.env.APP_LOCATION = __dirname
var cluster = require('cluster')

require('dotenv').config()

if (cluster.isMaster) require(path.resolve(`${process.env.APP_LOCATION}/cluster/master.js`))
else {
	worker = require(path.resolve(`${process.env.APP_LOCATION}/cluster/worker.js`))
}