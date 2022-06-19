const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs')
const path = require('path')
const jose = require('jose')


const jwtPublic = fs.readFileSync(process.env.JWT_PUBLIC_KEY_LOCATION || path.resolve(process.env.HOME + '/certs/jwt.key.pub'))
const jwtPublicAsKey = jose.JWK.asKey(jwtPublic, {alg: 'PS384', use: 'sig'})

var jwtPrivateAsKey
try {
	const jwtPrivate = fs.readFileSync(process.env.JWT_PRIVATE_KEY_LOCATION || path.resolve(process.env.HOME + '/certs/jwt.key'))
	jwtPrivateAsKey = jose.JWK.asKey(jwtPrivate, {alg: 'PS384', use: 'sig'})
}
catch (e) {
}

var jwtAudience = 'network'
var jwtIssuer = 'network'

if (process.env.JWT_AUDIENCE) {
	let audience = process.env.JWT_AUDIENCE
	jwtAudience = audience.split(',')
}
if (process.env.JWT_ISSUER) {
	let issuer = process.env.JWT_ISSUER
	jwtIssuer = issuer.split(',')
}

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

function joseVerifyOrDecrypt(data, conf = {}) {
	function algorithmSplitter(algo) {
		if (conf.algorithm.includes(',')) return conf.algorithm.split(',')
		return [algo]
	}
	if (conf.algorithm && !conf.algorithms) {
		
		conf.algorithms = algorithmSplitter(conf.algorithm)
		
	}
	let verified;
	try {
		verified = jose[conf.typ || 'JWT'].verify(
			data,
			jwtPublicAsKey,
			{
				issuer: jwtIssuer,
				audience: jwtAudience,
				algorithms: conf.algorithms || ['PS384'],
				
			}
		)
	}
	catch(e) {
		verified = null
	}
	
	return verified
}

function generateOperationCode() {
	const code = new Date().getTime() + "__" + uuidv4()
	return code
}

var validatePassLocal = function(plainPass, hashedPass, callback)
{
	var salt = hashedPass.substr(0, 64);
	function validate(err,derivedKey) {
		if (err) { 
			return callback(err)
		}
		if (salt + derivedKey.toString("hex") === hashedPass) {
			return callback(null, 'ok');
		}
		return callback('mismatch')
	}
	crypto.scrypt(salt + plainPass, salt, 128, validate);
}

function generateSalt () {
	var salt = crypto.randomBytes(128).toString('base64').slice(0, 64);
	return salt;
}

function saltAndHash(pass, callback) {

	var salt = generateSalt();

	crypto.scrypt(salt + pass, salt, 128, (err, derivedKey) => {

		if (err) { 
			return callback(err)
		}
		
		return callback(null, salt + derivedKey.toString("hex"));

	});
}

module.exports = {
	saltAndHash,
	generateSalt,
	validatePassLocal,
	generateOperationCode,
	joseSign,
	joseVerifyOrDecrypt
}
