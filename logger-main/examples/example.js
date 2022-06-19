const logger  = require('..')({
	hostname: 'test-host',
	slackChannel: 'test',
	component: 'test'
})

logger.fatal('fatal error')
logger.error('error')
logger.warn('warning')
logger.info('info message')
logger.debug('some debug info')
logger.fatal(new Error('fuck you'))