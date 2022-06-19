require('dotenv').config()
if (process.env.NODE_ENV === 'production') return process.exit(111)

process.env.NODE_ENV = 'test'
process.env.NO_LOGGING = 'true'