const jose = require('jose')
const fs = require('fs')
const path = require('path')
const jwtPrivate = fs.readFileSync(process.env.JWT_PRIVATE_KEY_LOCATION || path.resolve(process.env.HOME + '/certs/jwt.key'))
const jwtPublic = fs.readFileSync(process.env.JWT_PUBLIC_KEY_LOCATION || path.resolve(process.env.HOME + '/certs/jwt.key.pub'))

const jwtPrivateAsKey = jose.JWK.asKey(jwtPrivate, {alg: 'PS384', use: 'sig'})
const jwtPublicAsKey = jose.JWK.asKey(jwtPublic, {alg: 'PS384', use: 'sig'})

var jwtAudience = 'network'
var jwtIssuer = 'network'

function joseSign(data, conf = {}) {
	let header = {
		typ: 'JWT'
	}
	if (conf.header) {
		header = Object.assign(header, conf.header)
	}
	const signed = jose[header.typ].sign(
		data,
		jwtPrivateAsKey,
		{
			kid: true,
			algorithm: conf.algorithm || 'PS384',
			audience: jwtAudience,
			expiresIn: conf.expiresIn || '1 hour',
			header: header,
			issuer: jwtIssuer,
			now: conf.now || new Date()
		}
	)
	return signed
}

const l = joseSign({cool: 'yeah'})

console.log(l)

function joseVerifyOrDecrypt(data, conf = {}) {
	function algorithmSplitter(algo) {
		if (conf.algorithm.includes(',')) return conf.algorithm.split(',')
		return [algo]
	}
	if (conf.algorithm && !conf.algorithms) {
		
		conf.algorithms = algorithmSplitter(conf.algorithm)
		
	}
	const verified = jose[conf.typ || 'JWT'].verify(
		data,
		jwtPublicAsKey,
		{
			issuer: jwtIssuer,
			audience: jwtAudience,
			algorithms: conf.algorithms || ['PS384'],
			
		}
	)
	return verified
}

const k = joseVerifyOrDecrypt(l)
console.log(k)