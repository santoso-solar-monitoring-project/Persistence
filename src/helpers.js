import { google } from 'googleapis';
import { ERROR, LOG, promisify } from './utils';

export async function createSheet(title) {
  const sheets = google.sheets({ version: 'v4' });
  const resource = {
    properties: {
      title,
    },
  };

  return promisify(sheets.spreadsheets)
    .create({
      resource,
      // fields: 'spreadsheetId',
    })
    .then(
      res => {
        const spreadsheet = res.data;
        LOG(`Created Spreadsheet ID: ${spreadsheet.spreadsheetId}`);
        return spreadsheet.spreadsheetId;
      },
      err => {
        ERROR(`Couldn't create sheet:`, err.stack);
        throw err;
      }
    );
}

export async function listFiles() {
  const drive = google.drive({ version: 'v3' });

  return promisify(drive.files)
    .list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)',
    })
    .then(
      res => {
        const files = res.data.files;
        if (files.length) {
          LOG('Files:');
          files.map(file => {
            LOG(`${file.name} (${file.id})`);
          });
        } else {
          LOG('No files found.');
        }
      },
      err => {
        ERROR(`Couldn't list files:` + err.stack);
        throw err;
      }
    );
}

export async function moveFile(fileId, folderId) {
  const drive = google.drive({ version: 'v3' });

  // Retrieve the existing parents to remove
  return promisify(drive.files)
    .get({
      fileId: fileId,
      fields: 'parents',
    })
    .then(res => {
      const file = res.data;
      // Move the file to the new folder
      var previousParents = file.parents.join(',');
      return promisify(drive.files).update({
        fileId: fileId,
        addParents: folderId,
        removeParents: previousParents,
        fields: 'id, parents',
      });
    })
    .then(res => {
      // File moved.
      const file = res.data;
      LOG(`File moved. id: ${file.id}, parents: ${file.parents}`);
      return file;
    })
    .catch(err => {
      ERROR(`Couldn't move file:`, err.stack);
      throw err;
    });
}

export async function appendToSheet(
  spreadsheetId,
  values,
  range = 'A1',
  silent = false
) {
  const _LOG = silent ? () => {} : LOG;
  const sheets = google.sheets({ version: 'v4' });
  const resource = {
    values,
  };
  return promisify(sheets.spreadsheets.values)
    .append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource,
      includeValuesInResponse: false,
    })
    .then(
      res => {
        const { updatedCells, updatedRange } = res.data.updates;
        _LOG(
          `${updatedCells} cells appended to range ${updatedRange.substring(
            7
          )}.`
        );
        return res.data;
      },
      err => {
        ERROR(`Couldn't append to sheet:`, err.stack);
        throw err;
      }
    );
}

export async function writeToSheet(spreadsheetId, values, range = 'A1') {
  const sheets = google.sheets({ version: 'v4' });
  const resource = {
    values,
  };
  return promisify(sheets.spreadsheets.values)
    .update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource,
      includeValuesInResponse: false,
    })
    .then(
      res => {
        const { updatedCells, updatedRange } = res.data;
        LOG(
          `${updatedCells} cells written to range ${updatedRange.substring(7)}.`
        );
        return res.data;
      },
      err => {
        ERROR(`Couldn't write to sheet`, err.stack);
        throw err;
      }
    );
}

export async function autoResizeColumns(spreadsheetId) {
  const sheets = google.sheets({ version: 'v4' });
  const resource = {
    requests: [
      {
        autoResizeDimensions: {
          dimensions: {
            // I'm pretty sure sheetId is always 0 by default for the first sheet.
            // See: https://developers.google.com/sheets/api/guides/concepts#sheet_id
            sheetId: 0,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 26,
          },
        },
      },
    ],
  };
  return promisify(sheets.spreadsheets)
    .batchUpdate({
      spreadsheetId,
      resource,
    })
    .then(
      () => {
        LOG(`Auto-resized column widths for sheet (${spreadsheetId}).`);
      },
      err => {
        ERROR(`Couldn't auto-resize columns:`, err.stack);
        throw err;
      }
    );
}

export async function numberOfRows(spreadsheetId) {
  return (
    +(await appendToSheet(
      spreadsheetId,
      [['']],
      'A1',
      true
    )).updates.updatedRange.substring(8) - 1
  );
}
