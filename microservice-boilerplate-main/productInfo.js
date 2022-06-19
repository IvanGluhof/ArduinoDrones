var packageJson = require('./package.json')

var productInfo = {
	name: packageJson.name,
	version: packageJson.version,
	codename: packageJson.codename
}
module.exports = productInfo