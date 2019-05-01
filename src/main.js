import { LOG, ERROR, M, msUntilMidnight, todayDateString } from './utils';
import authenticate from './authenticate';
import { promises as fs } from 'fs';
import * as helpers from './helpers';
import path from 'path';
import derivedConfig from '../config/derived.config.json';
import pusherConfig from '../config/pusher.config.json';
import solcastConfig from '../config/solcast.config.json';
import pusherData from './pusherData';
import axios from 'axios';

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

// File IDs of the important Google Drive folders where all the data is stored.
const ID = Object.freeze({
  root: '1fIbkh2C2daDOJPk-vvpWKOTbHOwvjiS2',
  derived: '1qMCRSfBtrOWzzYP5HQjk9J4uipNkbaDP',
  measurements: '1nvk-XK9SY1_KmdSXyGzGLjNIJXDipFKO',
  solcast: '1Tgn9yD6HzDxOV4uOBrOHWWQ2FVuc41yJ',
});

// File IDs of today's files that will be populated.
const TODAY_ID = {
  derivedFile: '',
  measurementsFile: '',
  solcastFile: '',
  today: '',
};

// This file stores today's file IDs in case of a crash.
const TODAY_PATH = path.resolve(__dirname, '../config/today.json');

// The current total solar irradiance reported by Solcast.
let totalIrradiance = NaN;

// setInterval and setTimeout IDs to clear on error.
let intervalIDs = [];

// Make a new derived values file. Move to the right folder. Write the column names. Auto-resize column widths.
async function makeDerivedFile() {
  const derivedFile = await helpers.createSheet(todayDateString());
  await helpers.moveFile(derivedFile, ID.derived);
  await helpers.appendToSheet(derivedFile, [derivedConfig.fields]);
  await helpers.autoResizeColumns(derivedFile);

  return derivedFile;
}

// Make a new measurements file. Move to the right folder. Write the column names. Auto-resize column widths.
async function makeMeasurementsFile() {
  const measurementsFile = await helpers.createSheet(todayDateString());
  await helpers.moveFile(measurementsFile, ID.measurements);
  await helpers.appendToSheet(measurementsFile, [
    ['Timestamp', 'Local Time', ...pusherConfig.channelNames],
  ]);
  await helpers.autoResizeColumns(measurementsFile);
  return measurementsFile;
}

// Make a new Solcast data file. Move to the right folder. Write the column names. Auto-resize column widths.
async function makeSolcastFile() {
  const solcastFile = await helpers.createSheet(todayDateString());
  await helpers.moveFile(solcastFile, ID.solcast);
  await helpers.appendToSheet(solcastFile, [solcastConfig.fields]);
  await helpers.autoResizeColumns(solcastFile);
  return solcastFile;
}

async function daily() {
  // Load backup for today's IDs.
  const backup = await fs
    .readFile(TODAY_PATH)
    .then(content => JSON.parse(content), err => ({}));

  // Check if backup is actually dated for today. (Use it if so.)
  if (backup.today === todayDateString()) {
    LOG(
      `Backup for today's file IDs found (${TODAY_PATH}). Restoring from backup.`
    );
    // Restore from backup.
    Object.assign(TODAY_ID, backup);
    return;
  }

  // Make a new file for each type of data.
  const derivedFile = await makeDerivedFile();
  const measurementsFile = await makeMeasurementsFile();
  const solcastFile = await makeSolcastFile();

  // Record their file IDs.
  const today = todayDateString();
  Object.assign(TODAY_ID, {
    derivedFile,
    measurementsFile,
    solcastFile,
    today,
  });

  // Write the file IDs to disk in case program crashes.
  await fs
    .writeFile(TODAY_PATH, JSON.stringify(TODAY_ID))
    .then(
      () => LOG(`Backing up today's file IDs to`, TODAY_PATH),
      err => ERROR(`Error backing up today's file IDs:`, err)
    );

  // Schedule the next daily() call at the next midnight.
  intervalIDs.push(
    setTimeout(() => {
      daily();
    }, msUntilMidnight())
  );
}

async function updateSolcast() {
  if (!TODAY_ID.solcastFile) {
    throw Error(
      'Expected Solcast sheet file ID for today but got ' + TODAY_ID.solcastFile
    );
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
      await helpers.writeToSheet(TODAY_ID.solcastFile, values, range);
      helpers.autoResizeColumns(TODAY_ID.solcastFile);
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
  const [cos, sin] = [Math.cos, Math.sin].map(f => x => f((x / 180) * Math.PI));
  const cosBetaIncident =
    sin(sunZenith) * sin(panelTilt) * cos(sunAzimuth - panelAzimuth) +
    cos(sunZenith) * cos(panelTilt);
  const irradiation = (dhi + dni * cosBetaIncident) * panelArea;
  return irradiation;
}

async function updateMeasurements() {
  if (!TODAY_ID.measurementsFile) {
    throw Error(
      'Expected Measurements sheet file ID for today but got ' +
        TODAY_ID.measurementsFile
    );
  }
  // Slice values off the pusherData buffer, and if there are any elements then write them to the sheet.
  const compare = ([a], [b]) => +M(a) - +M(b);
  // Don't slice them all (save 10) to ensure the slice preserves time order.
  // (Messages arrive asynchronously from Pusher in non-deterministic order.)
  const values = pusherData
    .splice(0, Math.max(0, pusherData.length - 10))
    .sort(compare);

  if (values.length) {
    const derived = updateDerived(values);
    await helpers.appendToSheet(TODAY_ID.measurementsFile, values);
    helpers.autoResizeColumns(TODAY_ID.measurementsFile);
    await derived;
  } else {
    LOG('No Pusher data received in the last minute.');
  }
}

// Don't call directly. This function is called by updateMeasurements.
async function updateDerived(measuredValues) {
  console.assert(measuredValues.length);
  const rowNum = (await helpers.numberOfRows(TODAY_ID.derivedFile)) + 1;
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

    const [j, k] = [rowNum + i - 1, rowNum + i];
    const row = {
      Timestamp,
      'Local Time': LocalTime,
      'MPPT Power (W)': MPPTCurrent * MPPTVoltage,
      'MPPT Energy Accumulated (Wh)': zeroOnFirst(
        `=D${j}+C${k}*(A${k}-A${j})/3600e3`
      ),
      'Load-Only Power (W)': LoadOnlyCurrent * LoadOnlyVoltage,
      'Load-Only Energy Accumulated (Wh)': zeroOnFirst(
        `=F${j}+E${k}*(A${k}-A${j})/3600e3`
      ),
      'Total Irradiance (W/m^2)': totalIrradiance || 0,
      'Theoretical Power (W)': totalIrradiance * derivedConfig.panelArea,
      'Theoretical Energy Accumulated (Wh)': zeroOnFirst(
        `=I${j}+H${k}*(A${k}-A${j})/3600e3`
      ),
    };

    return derivedConfig.fields.map(field => row[field]);
  });

  await helpers.appendToSheet(TODAY_ID.derivedFile, values);
  helpers.autoResizeColumns(TODAY_ID.derivedFile);
}

async function main() {
  try {
    await authenticate();
    LOG('Authentication for Google APIs successful.');
    await daily();
    await updateSolcast();
    await updateMeasurements();

    intervalIDs.push(setInterval(updateSolcast, 1800e3));
    intervalIDs.push(setInterval(updateMeasurements, 60e3));
  } catch (err) {
    ERROR(err);
    pusherData.disconnect();
    intervalIDs.forEach(id => (clearInterval(id), clearTimeout(id)));
  }
}

main();
