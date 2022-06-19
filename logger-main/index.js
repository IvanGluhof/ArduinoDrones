const os = require('os');
const Axe = require('axe');
const { WebClient } = require('@slack/web-api');
const isProduction = process.env.NODE_ENV === 'production';

function constructLogger(loggerConfig = {}) {
	if (process.env.NODE_ENV === 'test' && process.env.NO_LOGGING == 'true') {
		loggerConfig.level === 'fatal'
	}
	const pinoConfig = {
		level: loggerConfig.level || process.env.LOG_LEVEL || isProduction ? 'warn' : 'info',
		customLevels: {
			log: 30
		},
		hooks: {
			// <https://github.com/pinojs/pino/blob/master/docs/api.md#logmethod>
			logMethod(inputArgs, method) {
				return method.call(this, {
					// <https://github.com/pinojs/pino/issues/854>
					// message: inputArgs[0],
					msg: inputArgs[0],
					meta: inputArgs[1]
				});
			}
		},
		prettyPrint: isProduction ? false : { colorize: true }
	}
	const pino = require('pino')(pinoConfig);

	const config = {
		logger: pino,
		level: loggerConfig.level || process.env.LOG_LEVEL || isProduction ? 'warn' : 'info',
		name: loggerConfig.hostname || process.env.HOSTNAME || os.hostname(),
		capture: false
	};

	const slackLogger = new Axe(config);
	const slackWeb = new WebClient(loggerConfig.slackKey || process.env.SLACK_LOGGER_KEY, {
		logger: slackLogger,
		logLevel: config.level
	});

	const axe = new Axe({ ...config });
	const axeFallback = new Axe({ ...config });

	axe.setCallback(async (level, message, meta) => {
		try {
			// if it was not an error then return early
			if (!['error', 'fatal'].includes(level) && isProduction) return;

			// otherwise post a message to the slack channel
			const result = await slackWeb.chat.postMessage({
				channel: loggerConfig.slackChannel || process.env.SLACK_LOGGER_CHANNEL || 'test',
				username: 'Logger',
				icon_emoji: ':evergreen_tree:',
				attachments: [
					{
						title: meta.err && meta.err.message ? meta.err.message : message,
						color: chooseColor(meta.level),
						text: JSON.stringify(meta),
						fields: [
							{
								title: 'Component',
								value: loggerConfig.component || 'N/A',
								short: true
							},
							{
								title: 'Level',
								value: meta.level,
								short: true
							},
							{
								title: 'Environment',
								value: meta.app.environment,
								short: true
							},
							{
								title: 'Hostname',
								value: config.name || meta.app.hostname,
								short: true
							}
						]
					}
				]
			});

			// finally log the result from slack

			if (result.ok !== true) {
				axeFallback.error('slackWeb.chat.postMessage', { result, callback: false });
			}
			
		} catch (err) {
			axeFallback.error(err, { callback: false });
		}
	});

	return axe

}

function chooseColor(level) {
	switch(level) {
		case "error":
			return "#FF2600"
		case "fatal":
			return "#941100"
		case "warn":
			return "#EAD239"
		case "info":
		case "log":
			return "#0096FF"
		default:
			return "#000000"
	}
}

module.exports = constructLogger