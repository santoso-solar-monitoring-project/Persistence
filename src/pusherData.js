import Pusher from 'pusher-js';
import { ERROR, LOG, M, WARN } from './utils';
import pusherConfig from '../config/pusher.config.json';

// Configuration to connect to Pusher.
// Note: This causes the script to keep running indefinitely until killed.
const pusher = new Pusher(pusherConfig.key, pusherConfig.options);
LOG('Pusher connection established.');

// Channel configuration for how data is being sent.
const CHANNEL_ID = pusherConfig.channelIDs;
const EVENT_NAME = pusherConfig.eventName;

// Event handler for new data.
function stage(ch, data) {
  const [ ts, value ] = data;
  // Create sample for this timestamp if doesn't exist.
  const sample = (stagingBuffer[ts] = stagingBuffer[ts] || []);
  // Write channel value to sample.
  sample[chToIndex(ch)] = value;
  if (sample.filter(Boolean).length === CHANNEL_ID.length) {
    // All channels accounted. Place sample in ready buffer.
    const localTime = M(ts).format('LTS');
    readyBuffer.push([ ts, localTime, ...sample ]);
    stagingBuffer.delete(ts);
  }
}
const chToIndex = ch => +ch.slice(2);

// Map of timestamps to samples (arrays of channel data).
const stagingBuffer = new Map();
// Intermediate buffer to hold on to data between flushes.
const readyBuffer = [];

// Monitor the size of staging buffer. If not all Pusher channels are being transmitted there will be a buildup of values that will eventually lead the program to crash. Detect this early.
const monitorID = setInterval(() => {
  if (stagingBuffer.size > 10) {
    WARN(
      `Pusher staging buffer is showing undesireable build-up (size ${stagingBuffer.size}). If this number is too big, it could mean not all channels are being transmitted (${CHANNEL_ID.join(
        ', '
      )}). This script waits for all channels to report a value before marking the sample as ready for flushing.`
    );
  }
  if (stagingBuffer.size > 1000) {
    ERROR(
      `Pusher staging buffer has exceeded 1000 elements (size: ${stagingBuffer.size}), which indicates not all Pusher channels are being transmitted.`
    );
  }
}, 60e3);

// Attach event listeners per channel.
CHANNEL_ID.forEach(ch => {
  const channel = pusher.subscribe(ch);
  channel.bind(EVENT_NAME, ({ payload }) => payload.forEach(pair => stage(ch, pair)));
});

LOG(`Listening to Pusher channels: ${CHANNEL_ID.join(', ')}.`);

readyBuffer.disconnect = () => (
  clearInterval(monitorID), LOG('Disconnecting Pusher.'), pusher.disconnect()
);
export const pusherData = readyBuffer;
