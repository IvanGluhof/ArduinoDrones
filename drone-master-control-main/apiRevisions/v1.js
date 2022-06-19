module.exports = function (logger, webServer, app, socketIo) {
	const path = require('path')
	const { isValidLatitude, isValidLongitude } = require('is-valid-geo-coordinates');
	const fyrejet = require('fyrejet')
	const driver = require('drone-ai-database')
	const db = driver.getDatabase()
	const authApi = require('drone-ai-authapi')(db)
	const { v4: uuidv4 } = require('uuid');
	const objectId = require('mongodb').ObjectID

	const homebases = driver.getCollection('homebases')
	const homebasesFns = require(path.resolve(process.env.APPLICATION_LOCATION+'/lib/homebasesFns'))(homebases)

	const drones = driver.getCollection('drones')
	const droneHelpers = require(path.resolve(process.env.APPLICATION_LOCATION+'/lib/droneHelpers'))(drones)

	function badData(req,res, data) {
		if (!data) data = {}
		res.statusCode = data.code || 400
		return res.json({
			code: data.code || 400,
			status: data.status || 'client-error',
			error: data.error || 'bad-data'
		})
	}

	function verifyAuth(req,res,next) {
		let authHeader = req.headers.authorization ? req.headers.authorization : null
		if (authHeader) authHeader = authHeader.replace('Bearer ', '')
		authApi.verifyAccessToken(authHeader || req.body.token || req.query.token, (e, o) => {
			if (e) {
				let data = {
					code: 401,
					error: e
				}
				return badData(req,res, data)
				
			}
			if (o.type === 'access') {
				req.user = o.user;
				return next()
			}
			let data = {
				code: 401,
				error: 'refresh-token-provided-instead-of-access-token'
			}
			return badData(req,res, data)
		})
	}	

	var apiv1 = fyrejet.Router()

	var findHomeBase = (req,res,next) => {
		const lon = req.body.lon || req.query.lon
		const lat = req.body.lat || req.query.lat
		if (!lon || !lat || !isValidLongitude(lon) || !isValidLatitude(lat)) {
			return badData(req,res)
		}
		const maxDistance = req.body.maxDistance || req.query.maxDistance
		const limit = req.body.limit || req.query.limit
		const types = req.body.types || req.query.types
		const access = req.user.access || 'user'
		homebasesFns.findClosestHomebases(lon, lat, maxDistance, access, types, limit, (e,o) => {
			if (e) {
				let data = {
					code: 500,
					status: 'server-error',
					error: e
				}
				return badData(req,res, data)
			}
			
			return res.json({
				code: 200,
				status: 'ok',
				data: o
			})
			
		})
	}

	apiv1.get('/homebases/find/', verifyAuth, findHomeBase)
	apiv1.post('/homebases/find/', verifyAuth, findHomeBase)

	var homebaseCapacity = (req,res,next) => {
		const baseID = req.body.id || req.query.id
		if (!baseID) {
			return badData(req,res)
		}
		const access = req.user.access || 'user'
		homebasesFns.homebaseData(baseID, access, {projection: {'capacity': 1}}, (e,o) => {
			function errHandler(e) {
				let data = {
					code: 500,
					status: 'server-error',
					error: e
				}
				return badData(req,res, data)
			}
			if (e) {
				return errHandler(e)
			}
			
			drones.countDocuments({baseID: objectId(baseID)}, (e, dronesCount) => {
				if (e) {
					return errHandler(e)
				}
				o.free = o.capacity - dronesCount
				o.used = o.capacity - o.free;
				return res.json({
					code: 200,
					status: 'ok',
					data: o
				})

			})
			

		})

	}

	apiv1.get('/homebases/capacity/', verifyAuth, homebaseCapacity)
	apiv1.post('/homebases/capacity/', verifyAuth, homebaseCapacity)

	function reserveDrones(req,res,next) {
		
		const baseID = req.body.baseID
		const dronesOrder = req.body.order || req.body.dronesOrder;
		if (!dronesOrder) {
			return badData(req,res)
		}
		if (!Array.isArray(dronesOrder)) {
			if (typeof dronesOrder !== 'object') {
				return badData(req,res)
			}
			dronesOrder = [dronesOrder]
		}
		/* dronesOrder = [{
			type: 'quadcopter',
			count: 2,
			operationalRange: 4,
			capabilities: []
		}]
		*/
		
		const droneTypes = droneHelpers.droneTypes
		let dronesCount = 0
		for (let n=0; n < dronesOrder.length; n++) {
			let item = dronesOrder[n];
			dronesCount = dronesCount + item.count || 1
			if (!droneTypes.includes(item.type)) {
				return badData(req,res)
			}
		}
		
		if (!baseID) {
			return badData(req,res)
		}
		const access = req.user.access || 'user'
		var partialFail = false
		let partialFailReasons = []
		const code = uuidv4();
		const timeNow = Math.floor(new Date().getTime() / 1000)

		let promises = []
		dronesOrder.forEach(subOrder => {
			
			promises.push(new Promise((resolve,reject) => {
				let internalPromises = []
				for (let n = 0; n < (subOrder.count || 1); n++) {
					
					internalPromises.push(new Promise((resolve2,reject2) => {
						
						let queryBuilder = {
							status: 'on-base',
							baseID: objectId(baseID),
							access: {$in: access},
							type: subOrder.type,
							operationalRange: {$gte: subOrder.operationalRange || 1}, 
							battery: {$gte: 95}, 
							$or: [{reserveTime: null}, {reserveTime: {$lt: timeNow - 300}}]
						}
						if (subOrder.capabilities && Array.isArray(subOrder.capabilities) && subOrder.capabilities.length) queryBuilder['capabilities'] = {$all: subOrder.capabilities}
						drones.findOneAndUpdate(queryBuilder, {$set: {reserveTime: timeNow, reserveCode: code}}, (e,o) => {
							if (e) {
								console.log(e)
								partialFail = true
								if (!partialFailReasons.includes('db-error')) partialFailReasons.push('db-error')
								
								return resolve2('error')
							}
							if (o && o.value) {
								return resolve2(o.value)
							}
							partialFail = true
							if (!partialFailReasons.includes('not-enough-drones')) partialFailReasons.push('not-enough-drones')
							return resolve2('error')
							
						})
					}))
					
				}
				
				Promise.all(internalPromises).then((results) => {
					const nonErredResults = results.filter(result => result !== 'error' && result !== 'not-enough-drones' )
					resolve(nonErredResults)
				})
			}))
			
		})
		Promise.all(promises).then((results) => {
			let finalResults = results.flat();
			
			let data = {
				code: finalResults.length ? 200 : 500,
				status: finalResults.length ? (partialFail ? 'partial-success' : 'ok') : 'error',
				data: {
					reserved: finalResults,
					reserveTimeout: timeNow + 300
				}
			}
			if (partialFailReasons.length) data.data.failReasons = partialFailReasons
			return res.status(data.code).json(data)
		})
		

	}

	apiv1.post('/drones/reserve/', verifyAuth, reserveDrones)

	return apiv1
}