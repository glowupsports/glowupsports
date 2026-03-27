const noop = () => {};

const logger = {
  log: __DEV__ ? console.log.bind(console) : noop,
  warn: __DEV__ ? console.warn.bind(console) : noop,
  error: __DEV__ ? console.error.bind(console) : noop,
  info: __DEV__ ? console.info.bind(console) : noop,
  debug: __DEV__ ? console.debug.bind(console) : noop,
};

export default logger;
