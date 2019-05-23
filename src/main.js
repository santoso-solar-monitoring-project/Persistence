import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { clamp, ERROR, LOG, M, msUntilMidnight, todayDateString } from './utils';
import { authenticate } from './authenticate';
import * as helpers from './helpers';
import { pusherData } from './pusherData';
import { setupDrive } from './setupDrive';
import { TaskQueue } from './TaskQueue';
import derivedConfig from '../config/derived.config.json';
import pusherConfig from '../config/pusher.config.json';
import solcastConfig from '../config/solcast.config.json';

/* 
  Overview:
  
  DAILY (24 hr interval)
  create <today> -> MEASUREMENTS_ID
  create Solcast <today> -> SOLCAST_ID
  move '<today>' to 'Measurements/' (requires: MEASUREMENT_ID, ID_1)
  move 'Solcast <today>' to 'Solcast Data/' (requires: SOLCAST_ID, ID_2)

  SOLCAST UPDATE (15 min interval)
  call Solcast API -> data
  process data -> processedData
  update cells in 'Solcast <today>' (requires: SOLCAST_ID, processedData)

  MEASUREMENTS UPDATE (1 min interval)
  buffer incoming pusher data and calculate accumulated -> buffered
  append buffered to cells in <today> (requires: MEASUREMENT_ID, buffered)
*/

// Folder IDs of the important Google Drive folders where all the data is stored.
const SETUP = {};

// File IDs of today's files that will be populated.
const TODAY = {};
const todayConfigPath = path.resolve(__dirname, '../config/today.json');

// The current total solar irradiance reported by Solcast.
let totalIrradiance = NaN;

// Make a new derived values file. Move to the right folder. Write the column names. Auto-resize column widths.
async function makeDerivedFile() {
  const derivedFile = await helpers.createSheet(todayDateString());
  await helpers.moveFile(derivedFile, SETUP.derived);
  await helpers.appendToSheet(derivedFile, [ derivedConfig.fields ]);
  await helpers.autoResizeColumns(derivedFile);

  return derivedFile;
}

// Make a new measurements file. Move to the right folder. Write the column names. Auto-resize column widths.
async function makeMeasurementsFile() {
  const measurementsFile = await helpers.createSheet(todayDateString());
  await helpers.moveFile(measurementsFile, SETUP.measurements);
  await helpers.appendToSheet(measurementsFile, [
    [ 'Timestamp', 'Local Time', ...pusherConfig.channelNames ],
  ]);
  await helpers.autoResizeColumns(measurementsFile);
  return measurementsFile;
}

// Make a new Solcast data file. Move to the right folder. Write the column names. Auto-resize column widths.
async function makeSolcastFile() {
  const solcastFile = await helpers.createSheet(todayDateString());
  await helpers.moveFile(solcastFile, SETUP.solcast);
  await helpers.appendToSheet(solcastFile, [ solcastConfig.fields ]);
  await helpers.autoResizeColumns(solcastFile);
  return solcastFile;
}

async function daily(token) {
  try {
    // Load backup for today's IDs.
    const backup = await fs.readFile(todayConfigPath).then(x => JSON.parse(x));

    if (backup.date === todayDateString() && backup.token === token) {
      // If backup is from today and has the same authentication, then load from backup.
      LOG(`Backup for today's file IDs found (\`${todayConfigPath}\`). Restoring from backup.`);
      Object.assign(TODAY, backup);
      return;
    }
  } catch (_) {
    // pass
  }

  // Make a new file for each type of data.
  const derivedFile = await makeDerivedFile();
  const measurementsFile = await makeMeasurementsFile();
  const solcastFile = await makeSolcastFile();

  // Record their file IDs.
  const date = todayDateString();
  Object.assign(TODAY, {
    derivedFile,
    measurementsFile,
    solcastFile,
    date,
    token,
  });

  // Write the file IDs to disk in case program crashes.
  await fs
    .writeFile(todayConfigPath, JSON.stringify(TODAY, null, 2))
    .then(
      () => LOG(`Backing up today's file IDs to`, todayConfigPath),
      err => ERROR(`Error backing up today's file IDs:`, err)
    );
}

async function updateSolcast() {
  if (!TODAY.solcastFile) {
    throw Error('Expected Solcast sheet file ID for today but got ' + TODAY.solcastFile);
  }
  try {
    const { forecasts } = (await axios.get(solcastConfig.url)).data;
    // const { forecasts } = (await axios.get(
    //   'https://gist.githubusercontent.com/spenceryue/a47c9c2c2df3c3e008726e646fd0de76/raw/8306d80dcd382867635aa757b1470131e9b5aa65/tempSolcast.json'
    // )).data;

    // Update the current total solar irradiance.
    totalIrradiance = calculateTotalIrradiance(forecasts[0]);

    // Find out the range of cells we want to update.
    const start = M(forecasts[0].period_end);
    const remaining = Math.round(msUntilMidnight(start) / 1800e3);
    // Below assumes Solcast uses 30 min intervals.
    const startIdx = 48 - remaining;
    // Slice only the forecast values for today.
    const values = forecasts
      .slice(0, remaining)
      .map(row => solcastConfig.fields.map(field => row[field]));
    // Get the letter for the last column of the range.
    const range = `A${2 + startIdx}`;

    if (values.length) {
      await helpers.writeToSheet(TODAY.solcastFile, values, range);
      helpers.autoResizeColumns(TODAY.solcastFile);
      LOG('Solcast forecasts updated.');
    }
  } catch (err) {
    ERROR('No Solcast data available.');
    throw err;
  }
}

// See EE462L Week 4 Lab document.
function calculateTotalIrradiance(sample) {
  const { dhi, dni, zenith: sunZenith, azimuth: sunAzimuth } = sample;
  const { panelArea, panelTilt, panelAzimuth } = derivedConfig;
  // Convert trig functions to use degrees instead of radians.
  const [ cos, sin ] = [ Math.cos, Math.sin ].map(f => x => f(x / 180 * Math.PI));
  const cosBetaIncident =
    sin(sunZenith) * sin(panelTilt) * cos(sunAzimuth - panelAzimuth) +
    cos(sunZenith) * cos(panelTilt);
  const irradiation = (dhi + dni * cosBetaIncident) * panelArea;
  return irradiation;
}

async function updateMeasurements() {
  if (!TODAY.measurementsFile) {
    throw Error('Expected Measurements sheet file ID for today but got ' + TODAY.measurementsFile);
  }
  // Slice values off the pusherData buffer, and if there are any elements then write them to the sheet.
  const compare = ([ a ], [ b ]) => +M(a) - +M(b);
  // Don't slice them all (save 10) to ensure the slice preserves time order.
  // (Messages arrive asynchronously from Pusher in non-deterministic order.)
  const values = pusherData.splice(0, clamp(pusherData.length - 10, [ 0 ])).sort(compare);

  if (values.length) {
    const derived = updateDerived(values);
    await helpers.appendToSheet(TODAY.measurementsFile, values);
    helpers.autoResizeColumns(TODAY.measurementsFile);
    await derived;
  }
  else {
    LOG('No Pusher data received in the last minute.');
  }
}

// Don't call directly. This function is called by updateMeasurements.
async function updateDerived(measuredValues) {
  if (!measuredValues.length) {
    throw Error(`\`updateDerived\` got an empty array as input.`);
  }
  const rowNum = (await helpers.numberOfRows(TODAY.derivedFile)) + 1;
  const zeroOnFirst = x => (rowNum === 2 ? 0 : x);

  const values = measuredValues.map((measurement, i) => {
    const [
      Timestamp,
      LocalTime,
      MPPTVoltage,
      MPPTCurrent,
      LoadOnlyVoltage,
      LoadOnlyCurrent,
    ] = measurement;

    const [ j, k ] = [ rowNum + i - 1, rowNum + i ];
    const row = {
      Timestamp,
      'Local Time': LocalTime,
      'MPPT Power (W)': MPPTCurrent * MPPTVoltage,
      'MPPT Energy Accumulated (Wh)': zeroOnFirst(`=D${j}+C${k}*(A${k}-A${j})/3600e3`),
      'Load-Only Power (W)': LoadOnlyCurrent * LoadOnlyVoltage,
      'Load-Only Energy Accumulated (Wh)': zeroOnFirst(`=F${j}+E${k}*(A${k}-A${j})/3600e3`),
      'Total Irradiance (W/m^2)': totalIrradiance || 0,
      'Theoretical Power (W)': totalIrradiance * derivedConfig.panelArea,
      'Theoretical Energy Accumulated (Wh)': zeroOnFirst(`=I${j}+H${k}*(A${k}-A${j})/3600e3`),
    };

    return derivedConfig.fields.map(field => row[field]);
  });

  await helpers.appendToSheet(TODAY.derivedFile, values);
  helpers.autoResizeColumns(TODAY.derivedFile);
}

async function main() {
  try {
    const auth = await authenticate();
    LOG('Authentication for Google APIs successful.');

    const token = auth.credentials.refresh_token;
    const setup = await setupDrive(token);
    Object.assign(SETUP, setup);
    LOG(`App is configured to upload to \`${helpers.driveURL(setup.root)}\`.`);

    await daily(token);
    await updateSolcast();
    await updateMeasurements();

    // Schedule periodic updates
    const tasks = new TaskQueue();
    tasks.once(() => {
      tasks.repeat(daily.bind(null, token), 24 * 3600e3);
    }, msUntilMidnight());
    tasks.repeat(updateSolcast, 1800e3);
    tasks.repeat(updateMeasurements, 60e3);

    for await (const task of tasks) {
      await task();
    }
  } catch (err) {
    ERROR(err);
    pusherData.disconnect();
  }
}

main();
