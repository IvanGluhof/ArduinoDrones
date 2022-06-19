const superagent = require('superagent')
const logger = require('drone-ai-logger')({component: 'Drone Master Control Server - Server-Drone Communications'})

function initComms(caCert, cert, key) {
	function testIsAlive(drones, callback) {
		let promisesArray = []
		drones.forEach((drone, index) => {
			promisesArray.push(new Promise((resolve, reject) => {
				superagent.get(drone.address+'/api/v1/status/')
				.cert(cert)
				.key(key)
				.ca(caCert)
				.set('Content-Type', 'application/json')
				.end((err, res) => {
					let codeToResolve
					if (err) {
	
						codeToResolve = err.status || 500
						const data = {
							_id: drone._id,
							status: 'error',
							code: codeToResolve,
							error: err.response ? err.response.text : "unknown problem",
						}
						drones[index].status = 'error'
						drones[index].error = err
						logger.warn(drones[index])
						return resolve(data)
					}
					codeToResolve = res.status
					const data = {
						_id: drone._id,
						status: 'ok',
						code: codeToResolve,
						data: res.body
					}
					drones[index].status = 'ok'
					return resolve(data)
				})
			}))
		})
		Promise.all(promisesArray).then((results) => {
			const erredResults = results.filter(drone => drone.status === 'error')
			return callback(erredResults.length, drones) // if erredResults.length === 0, it will bascially evaluate into false, when we check for errors: if (e) {}
		})
	}
	function deliverPublicKey(drones, userPublicKey, callback) {
		/* 
			drones = [{
				address: 'https://127.0.0.1/',
				_id: 'SOME_GUID',
				authCode: 'SOME_CODE'
				capabilities: []
			}]
		*/
		let userPublicKeyBuff = new Buffer.from(userPublicKey);
		let userPublicKeyB64 = userPublicKeyBuff.toString('base64');
	
		let promisesArray = []
		drones.forEach((drone, index) => {
			let authCode = new Buffer.from(drone.authCode);
			let authCodeB64 = authCode.toString('base64');
			promisesArray.push(new Promise((resolve, reject) => {
				superagent.post(drone.address+'/api/v1/sendPubKey/')
				.cert(cert)
				.key(key)
				.ca(caCert)
				.set('Content-Type', 'application/json')
				.send({publicKey: userPublicKeyB64, authorization: `AUTH_CODE ${authCodeB64}`})
				.end((err, res) => {
					let codeToResolve
					if (err) {
	
						codeToResolve = err.status || 500
						const data = {
							_id: drone._id,
							status: 'error',
							code: codeToResolve,
							error: err.response ? err.response.text : "unknown problem"
						}
						drones[index].status = 'error'
						drones[index].error = err
						logger.warn(drones[index])
						return resolve(data)
					}
					codeToResolve = res.status
					const data = {
						_id: drone._id,
						status: 'ok',
						code: codeToResolve,
					}
					drones[index].status = 'ok'
					return resolve(data)
				})
			}))
		})
		Promise.all(promisesArray).then((results) => {
			const erredResults = results.filter(drone => drone.status === 'error')
			return callback(erredResults.length, drones) // if erredResults.length === 0, it will bascially evaluate into false, when we check for errors: if (e) {}
		})
	}
	return {
		deliverPublicKey,
		testIsAlive
	}
}


module.exports = {
	initComms
}