const { isValidLatitude, isValidLongitude } = require('is-valid-geo-coordinates');
const objectId = require('mongodb').ObjectID

function initDroneHelpers(drones) {
	this.droneTypes = ['quadcopter']
	return this
}

module.exports = initDroneHelpers