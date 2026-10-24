const OriginalDate = Date;
const now = Number(process.env.CHECK_DEADLINES_TEST_NOW);

global.Date = class extends OriginalDate {
  constructor(...args) {
    super(...(args.length === 0 ? [now] : args));
  }

  static now() {
    return now;
  }
};
