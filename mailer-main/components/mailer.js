const logger = require('drone-ai-logger')({component: 'Mailer - worker - web interface'})
const driver = require('drone-ai-database')
const nodemailer = require('nodemailer')
const objectId = require('mongodb').ObjectID

const emailConfig = {
	port: process.env.EMAIL_PORT || 587,
	host: process.env.EMAIL_HOST || 'localhost',
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS
	},
	tls: {
		secure: process.env.EMAIL_TLS_SECURE === 'true' ? true : false,
		rejectUnauthorized: process.env.EMAIL_TLS_ALLOW_UNAUTHORIZED === 'true' ? false : true,

	},
	connectionTimeout: 4500,
	greetingTimeout: 3500,
	logger: logger,
	debug: process.env.NODE_ENV === 'production' ? false : true,
	disableFileAccess: true,
	pool: true,
	maxConnections: 20,
	maxMessages: 250,

}

if (process.env.EMAIL_LOCAL_ADDRESS) {
	emailConfig.localAddress = process.env.EMAIL_LOCAL_ADDRESS
 }

const emailTransporter = nodemailer.createTransport(emailConfig)

module.exports = function (productInfo) {
	messageTasks = driver.getCollection('messageTasks')

	this.start = function() {
		process.on('message', (msg) => {
			if (msg.type = 'email') {
				logger.info('we need to send email')
				sendEmail(msg.contents)
			}
		})
	}

	function sendEmail(email) {
		emailTransporter.sendMail(email, (err,info) => {
			if (err) return logger.warn(err)
			return messageTasks.findOneAndUpdate({_id: objectId(email._id)}, {$set: {done: true, sentInfo: info}}, (e,o) => {
				if (e) {
					logger.warn('error occurred with email #'+email._id+ ' It is likely it might get sent again.')
					return logger.warn(e)
				}
				return
			})
		})
	}
	

	return this
}