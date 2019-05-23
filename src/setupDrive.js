import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as helpers from './helpers';
import { LOG, ERROR } from './utils';

export async function setupDrive(token) {
  const driveConfigPath = path.resolve(__dirname, '../config/drive.json');
  try {
    const setup = await fs.readFile(driveConfigPath).then(x => JSON.parse(x));
    if (setup.token === token) {
      // Previous valid setup with same Google account found. Abort setup.
      return setup;
    }
  } catch (_) {
    // Pass
  }

  LOG(`Setting up Google Drive to receive data uploads.`);

  // Create folders.
  const folders = await Promise.all(
    [
      'Santoso Solar Monitoring Project',
      'Derived Values',
      'Measurements',
      'Solcast Data',
    ].map(x => helpers.createFolder(x))
  );
  const [ root, derived, measurements, solcast ] = folders;
  const setup = {
    root,
    derived,
    measurements,
    solcast,
    token,
  };

  // Copy README
  const readme = makeReadme(root);

  // Move folders. Finish README copying.
  await Promise.all(folders.slice(1).map(x => helpers.moveFile(x, root)));
  await readme;

  // Store successful setup to disk.
  await fs.writeFile(driveConfigPath, JSON.stringify(setup, null, 2)).catch(err => {
    ERROR(
      `Couldn't save Google Drive setup information to disk (\`${driveConfigPath}\`):`,
      err.stack
    );
    throw err;
  });
  LOG(`Saved Google Drive setup information to disk (\`${driveConfigPath}\`).`);

  return setup;
}

async function makeReadme(root) {
  const sourceId = '1DWR5pGECZEVbqJZcYDhr2oV-yFiBteOvBP5zTCipnh8';
  const tmpFile = path.resolve(os.tmpdir(), 'readme.rtf');
  const title = 'README';

  // download template README
  await helpers.downloadFile(sourceId, tmpFile);

  // upload to new Google Drive
  const uploadId = await helpers.uploadFile(tmpFile, title);

  // delete local copy of README
  await fs
    .unlink(tmpFile)
    .catch(err => ERROR(`Could not delete \`${tmpFile}\` locally:`, err.stack));
  LOG(`Deleted \`${tmpFile}\` locally.`);

  // move uploaded README to the root
  await helpers.moveFile(uploadId, root);
}
