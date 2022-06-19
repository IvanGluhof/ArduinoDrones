const { isValidLatitude, isValidLongitude } = require('is-valid-geo-coordinates');
const objectId = require('mongodb').ObjectID

function initRegionsOps(homebases) { // homebases is mongodb collection
	homebases.createIndex( { location : "2dsphere" } )
	function findClosestHomebases(lon, lat, maxDistance, access, types, limit, callback) {
		if (!isValidLongitude(lon) || !isValidLatitude(lat)) return callback(new Error('bad-geocoordinates'))
		if (!callback) {
			callback = limit;
			limit = null
		}
		if (!limit || limit > 10) {
			limit = 10
		}
		if (!maxDistance) maxDistance = 400;
		if (maxDistance > 1500) maxDistance = 1500
		const queryBuilder = {
			"location": {
				$near: {
					$geometry: {
						type: "Point",
						coordinates: [lon , lat]
					},
					$maxDistance: maxDistance
				}
			}
		}
		if (access) {
			if (!Array.isArray(access)) {access = [access]}
			queryBuilder['access'] = {
				$in: access
			}
		}
		if (types) {
			if (!Array.isArray(types)) {types = [types]}
			queryBuilder['types'] = {
				$in: types
			}
		}
		homebases.find(queryBuilder, {limit: limit}).toArray(function(err, result) {
			if (err) {
				return callback(err)
			}
			return callback(null, result)
		})
	}

	function homebaseData(id, access, options, callback) {
		const queryBuilder = {
			_id: objectId(id)
		}
		if (access) {
			if (!Array.isArray(access)) {access = [access]}
			queryBuilder['access'] = {
				$in: access
			}
		}
		homebases.findOne(queryBuilder, options || {}, function(err, result) {
			if (err) {
				return callback(err)
			}
			return callback(null, result)
		})

	}
	
	return {
		findClosestHomebases,
		homebaseData
	}
}

module.exports = initRegionsOps