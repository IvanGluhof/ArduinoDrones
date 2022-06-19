# Logger
Logger constructor module

## Usage

### Environmental variables (`process.env`)

Can be set through `.env` file or using your OS native means (e.g. through shell on *nix systems)

Example of `.env` file:

```
SLACK_LOGGER_KEY=SOME_VALUE
HOSTNAME=superserver
```



| Name                   | Optional | Role                                                         |
| ---------------------- | -------- | ------------------------------------------------------------ |
| `NODE_ENV`             | `true`   | If `NODE_ENV` is `production`, it disables logging of most debug messages, unless overridden with other settings |
| `LOG_LEVEL`            | `true`   | Log level to use. Please consult [Pino documentation](https://github.com/pinojs/pino/blob/master/docs/api.md#level-string) for possible values. An additional value `log` exists, but it is equivalent to `info`. Overridable with `loggerConfig.level` |
| `HOSTNAME`             | `true`   | Hostname to show in Slack. Overridable with `loggerConfig.hostname`, defaults to `os.hostname()` |
| `SLACK_LOGGER_KEY`     | `false`  | API Token Key to use with Slack, likely starts with 'xoxb-'. You will experience errors, if you don't provide it OR `loggerConfig.slackKey`. Can be overriden with `loggerConfig.slackKey` |
| `SLACK_LOGGER_CHANNEL` | `true`   | Channel to post log messages to. Defaults to `test`, overridable with `loggerConfig.slackChannel` |

### `loggerConfig` Object

| Key            | Optional | Role                                                         |
| -------------- | -------- | ------------------------------------------------------------ |
| `level`        | `true`   | Log level to use. Please consult [Pino documentation](https://github.com/pinojs/pino/blob/master/docs/api.md#level-string) for possible values. An additional value `log` exists, but it is equivalent to `info`. |
| `hostname`     | `true`   | Hostname to show in Slack                                    |
| `slackKey`     | `true`   | API Token Key to use with Slack, likely starts with 'xoxb-'. If not provided, `process.env.SLACK_LOGGER_KEY` is used instead |
| `slackChannel` | `true`   | Slack channel to post to. Don't insert `#` in the beginning. |
| `component` | `true`   | Human-friendly designation of component using the logger. For instance, 'Auth service' |



### How to initialize:

```js
const logger  = require('..')({ // obviously location will be different for you
	hostname: 'test-host',
	slackChannel: 'test'
  slackKey: 'YOUR-SLACK-KEY'
})

logger.warn('some-warning') // or Error object, etc.
// 'some-warning will be sent to slack'

// Instead of warn, you can use the name of any log level. Please consult Pino documentation for exact behaviour: <https://github.com/pinojs/pino/blob/master/docs/api.md#logger>
```

