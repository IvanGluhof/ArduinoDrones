const superagent = require('superagent')
const utils = require('./utils')

if (!process.env.MAILER_ADDRESS) {
	process.env.MAILER_ADDRESS = 'http://localhost:8001'
}
if (!process.env.MAILER_KEY) {
	process.env.MAILER_KEY = 'uhWGMbzYrf44MNygr4m6EXm268U7xHC'
}
if (!process.env.MAILER_FROM) {
	process.env.MAILER_FROM = 'test@example.com'
}

const mailerKeyB64 = Buffer.from(process.env.MAILER_KEY).toString('base64')

function doTemplate(template, dataset) {
	let templateVariables = template.html.match(/\$__(.[^$__]+)__\$/gm)
	templateVariables = templateVariables.sort().filter(function(item, pos, ary) {
        return !pos || item != ary[pos - 1];
	});
	templateVariables.forEach(item => {
		const withLiteralDollarSign = utils.escapeString(item)
		template.html = template.html.replace(new RegExp(withLiteralDollarSign, 'gim'), dataset[item.split('__')[1]])
		template.text = template.text.replace(new RegExp(withLiteralDollarSign, 'gim'), dataset[item.split('__')[1]])
	})
	return template
}

function sendFromTemplate(document, messageTemplate, callback) {
	messageTemplate = doTemplate(messageTemplate, document)
	return superagent.post(process.env.MAILER_ADDRESS + '/email/send/')
		.set('Content-Type', 'application/json')
		.set('Authorization', 'Bearer ' + mailerKeyB64)
		.send({
			subject: messageTemplate.subject, 
			to: document.email,
			from: process.env.MAILER_FROM,
			text: messageTemplate.text,
			html: messageTemplate.html,
			attachments: messageTemplate.attachments || null,
			priority: messageTemplate.priority || 80,
		})
		.end((err,res) => {
			if (err) {
				return callback(err)
			}
			return callback(null, res.statusCode)
		})
}

module.exports = {
	doTemplate,
	sendFromTemplate
}