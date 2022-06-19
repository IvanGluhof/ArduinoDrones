var crypto = require('crypto')
const logger = require('drone-ai-logger')({component: 'Drone Master Control Server - Keygen'})

function genKeys(callback) {
	crypto.generateKeyPair('rsa', {
		modulusLength: 4096,
		publicKeyEncoding: {
		  type: 'spki',
		  format: 'pem'
		},
		privateKeyEncoding: {
		  type: 'pkcs8',
		  format: 'pem',
		  cipher: 'aes-256-cbc',
		  //passphrase: process.env.CLIENT_DRONE_SSL_PASS || 'top secret'
		}
	  }, (err, public, private) => {
		if (err) {
			logger.warn(err)
			return callback(err)
		}
		const data = {
			public,
			private
		}
		return callback(null, data)
	  });
}

module.exports = {
	genKeys
}