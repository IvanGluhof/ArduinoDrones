module.exports = function(app) {
	app.post('/json/', (req,res) => {
		return res.json(req.body)
	})
	app.get('/cluster-suicide/', (req,res) => {
		res.send('ok')
		return sendToMaster('global-shutdown')
	})

	setTimeout(() => {
		sendToMaster('global-shutdown');
	}, 7500) // we don't want to let backend run in testing mode for more than 7.5 seconds in any case.
}