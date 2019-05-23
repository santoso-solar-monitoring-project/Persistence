import M from 'moment-timezone';
export { default as M } from 'moment-timezone';

export const datePrefix = ({ level = 'INFO' } = {}) =>
  `${level.padStart(5)} | ${M().format('l')} | ${M().format('LTS').padStart(11, '0')} |`;

const enqueue = ((last = Promise.resolve()) => (what, when = datePrefix()) =>
  (last = last.then(() => new Promise(res => setTimeout(() => res(what(when)))))))();
export const LOG = (...x) => (enqueue(when => console.log(when, ...x)), x.slice(-1)[0]);
export const ERROR = (...x) => (
  enqueue(when => console.error(when, ...x), datePrefix({ level: 'ERROR' })), x.slice(-1)[0]
);
export const WARN = (...x) => (
  enqueue(when => console.error(when, ...x), datePrefix({ level: 'WARN' })), x.slice(-1)[0]
);

export const todayDateString = (date = M()) => date.format('MM-DD-YYYY');

export const msUntilMidnight = (now = M()) => M(now).endOf('day').add(1, 'ms') - now;

export function promisify(func, ...args) {
  return typeof func === 'function'
    ? args.length
      ? new Promise((resolve, reject) =>
          func(...args, (err, res) => (err ? reject(err) : resolve(res)))
        )
      : (...args) =>
          new Promise((resolve, reject) =>
            func(...args, (err, res) => (err ? reject(err) : resolve(res)))
          )
    : new Proxy(func, {
        get: (obj, prop) =>
          typeof obj[prop] === 'function' &&
          (args.length ? args.filter(x => x === prop).length : obj[prop].length >= 2)
            ? (...args) =>
                new Promise((resolve, reject) =>
                  obj[prop](...args, (err, res) => (err ? reject(err) : resolve(res)))
                )
            : obj[prop],
      });
}

export const clamp = (x, [ lo = x, hi = x ]) => Math.min(hi, Math.max(lo, x));
