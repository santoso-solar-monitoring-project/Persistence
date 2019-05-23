import fs from 'fs';
import { google } from 'googleapis';
import { ERROR, LOG, promisify } from './utils';

export async function createFolder(title) {
  const drive = google.drive({ version: 'v3' });
  const fileMetadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.folder',
  };

  const id = promisify(drive.files)
    .create({ resource: fileMetadata, fields: 'id' })
    .catch(err => {
      ERROR(`Couldn't create folder because:`, err.stack);
      throw err;
    })
    .then(res => {
      const folder = res.data;
      LOG(`Created folder at \`${driveURL(folder.id)}\`.`);
      return folder.id;
    });

  return id;
}

export async function createSheet(title) {
  const sheets = google.sheets({ version: 'v4' });
  const resource = {
    properties: {
      title,
    },
  };

  const id = promisify(sheets.spreadsheets)
    .create({
      resource,
      fields: 'spreadsheetId',
    })
    .catch(err => {
      ERROR(`Couldn't create sheet because:`, err.stack);
      throw err;
    })
    .then(res => {
      const spreadsheet = res.data;
      LOG(`Created spreadsheet at \`${sheetURL(spreadsheet.spreadsheetId)}\`.`);
      return spreadsheet.spreadsheetId;
    });

  return id;
}

export async function listFiles() {
  const drive = google.drive({ version: 'v3' });

  await promisify(drive.files)
    .list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)',
    })
    .catch(err => {
      ERROR(`Couldn't list files:` + err.stack);
      throw err;
    })
    .then(res => {
      const files = res.data.files;
      if (files.length) {
        LOG('Files:');
        files.map(file => {
          LOG(`${file.name} (ID: \`${sheetURL(file.id)}\`).`);
        });
      }
      else {
        LOG('No files found.');
      }
    });
}

export async function moveFile(sourceId, destId) {
  const drive = google.drive({ version: 'v3' });

  // Retrieve the existing parents to remove
  const { data: file } = await promisify(drive.files)
    .get({
      fileId: sourceId,
      fields: 'parents',
    })
    .catch(err => {
      ERROR(`Couldn't move file:`, err.stack);
      throw err;
    });

  // Move the file to the new folder
  const previousParents = file.parents.join(',');
  const updatedFile = promisify(drive.files)
    .update({
      fileId: sourceId,
      addParents: destId,
      removeParents: previousParents,
      fields: 'id, parents',
    })
    .catch(err => {
      ERROR(`Couldn't move file:`, err.stack);
      throw err;
    })
    .then(res => {
      // File moved.
      const file = res.data;
      LOG(`File moved (ID: \`${file.id}\`) (Destination ID: \`${file.parents}\`).`);
      return file;
    });

  return updatedFile;
}

export async function downloadFile(fileId, filePath, extension) {
  const drive = google.drive({ version: 'v3' });

  extension = extension || filePath.split('.').slice(-1)[0];
  if (!(extension in fileTypes)) {
    throw Error(
      `Unrecognized file extension: \`${extension}\`. Available choices: ${Object.keys(fileTypes)
        .map(x => `\`${x}\``)
        .join(', ')}.`
    );
  }

  const data = await drive.files
    .export({
      fileId: fileId,
      mimeType: fileTypes[extension].mime,
    })
    .catch(err => {
      ERROR(`Couldn't download file because:`, err.stack);
      throw err;
    })
    .then(res => {
      LOG(`Successfully downloaded file (ID: \`${fileId}\`).`);
      return res.data;
    });

  await fs.promises.writeFile(filePath, data).catch(err => {
    ERROR(`Couldn't write downloaded file to disk because:`, err.stack);
    throw err;
  });
  LOG(`Successfully saved file (ID: \`${fileId}\`) to \`${filePath}\`.`);
}

export const resourceTypes = {
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
};

export const fileTypes = {
  txt: {
    resource: 'doc',
    mime: 'text/plain',
  },
  rtf: {
    resource: 'doc',
    mime: 'application/rtf',
  },
  odt: {
    resource: 'doc',
    mime: 'application/vnd.oasis.opendocument.text',
  },
  html: {
    resource: 'doc',
    mime: 'text/html',
  },
  docx: {
    resource: 'doc',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    NOT_WORKING: '5/23/19',
  },
  pdf: {
    resource: 'doc',
    mime: 'application/pdf',
    NOT_WORKING: '5/23/19',
  },
  xlsx: {
    resource: 'doc',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

export async function uploadFile(filePath, title, extension) {
  const drive = google.drive({ version: 'v3' });

  extension = extension || filePath.split('.').slice(-1)[0];
  if (!(extension in fileTypes)) {
    throw Error(
      `Unrecognized file extension: \`${extension}\`. Available choices: ${Object.keys(fileTypes)
        .map(x => `\`${x}\``)
        .join(', ')}.`
    );
  }

  const resource = {
    name: title,
    mimeType: resourceTypes[fileTypes[extension].resource],
  };
  const media = {
    mimeType: fileTypes[extension].mime,
    body: fs.createReadStream(filePath),
  };

  const uploadedFileId = await promisify(drive.files)
    .create({
      resource,
      media,
      fields: 'id',
    })
    .catch(err => {
      ERROR(`Couldn't upload file (filePath: ${filePath}):`, err.stack);
      throw err;
    })
    .then(({ data }) => {
      LOG(
        `Uploaded file from \`${filePath}\` to Google Drive as \`${title}\` with ID \`${data.id}\`.`
      );
      return data.id;
    });

  return uploadedFileId;
}

export async function appendToSheet(spreadsheetId, values, range = 'A1', silent = false) {
  const sheets = google.sheets({ version: 'v4' });
  const _LOG = silent ? () => {} : LOG;
  const resource = {
    values,
  };

  const updates = promisify(sheets.spreadsheets.values)
    .append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource,
      includeValuesInResponse: false,
      fields: 'updates',
    })
    .catch(err => {
      ERROR(`Couldn't append to sheet:`, err.stack);
      throw err;
    })
    .then(res => {
      const { updatedCells, updatedRange } = res.data.updates;
      _LOG(`${updatedCells} cells appended to range ${updatedRange.substring(7)}.`);
      return res.data.updates;
    });

  return updates;
}

export async function writeToSheet(spreadsheetId, values, range = 'A1') {
  const sheets = google.sheets({ version: 'v4' });
  const resource = {
    values,
  };
  const updates = promisify(sheets.spreadsheets.values)
    .update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource,
      includeValuesInResponse: false,
    })
    .catch(err => {
      ERROR(`Couldn't write to sheet`, err.stack);
      throw err;
    })
    .then(res => {
      const { updatedCells, updatedRange } = res.data;
      LOG(`${updatedCells} cells written to range ${updatedRange.substring(7)}.`);
      return res.data;
    });

  return updates;
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

  await promisify(sheets.spreadsheets)
    .batchUpdate({
      spreadsheetId,
      resource,
    })
    .catch(err => {
      ERROR(`Couldn't auto-resize columns:`, err.stack);
      throw err;
    });
  LOG(`Auto-resized column widths for sheet (ID: \`${spreadsheetId}\`).`);
}

export async function numberOfRows(spreadsheetId) {
  const { updatedRange } = await appendToSheet(spreadsheetId, [ [ '' ] ], 'A1', true);
  return +updatedRange.substring(8) - 1;
}

export const sheetURL = spreadsheetId => `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

export const driveURL = driveId => `https://drive.google.com/drive/folders/${driveId}`;

export const files = google.drive({ version: 'v3' }).files;
