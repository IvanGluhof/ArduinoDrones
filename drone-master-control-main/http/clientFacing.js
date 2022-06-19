const path = require('path')

module.exports = function (logger, webServer, app, socketIo) {

	app.get('*', (req,res, next) => {
		console.log('one')
		return next()
	})

	app.use('/api/v1', require(path.resolve(__dirname + "/../apiRevisions/v1"))(logger, webServer, app, socketIo))

	app.all('*', (req, res) => {
		return res.status(404).json({code:404, status: 'client-error', error: 'not-found'})
	})

}