import { LOG, promisify, ERROR } from './utils';
import { promises as fs } from 'fs';
import { google } from 'googleapis';
import path from 'path';
import readline from 'readline';

// If modifying these scopes, delete token.json (for modifications to take effect).
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.resolve(__dirname, '../config/token.json');

// This file contains credentials for this project from console.developers.google.com.
const CREDENTIALS_PATH = path.resolve(__dirname, '../config/credentials.json');

/**
 * Create an OAuth2 client with the given credentials.
 * @param {Object} credentials The authorization client credentials.
 */
async function authorize(credentials) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = promisify(
    new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]),
    'getToken'
  );

  await fs
    .readFile(TOKEN_PATH)
    .then(
      token => oAuth2Client.setCredentials(JSON.parse(token)),
      () => getNewToken(oAuth2Client)
    );

  return oAuth2Client;
}

/**
 * Get and store new token after prompting for user authorization.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise(resolve =>
    rl.question('Enter the code from that page here: ', code => {
      rl.close();
      resolve(code);
    })
  );
  LOG(code);
  await oAuth2Client.getToken(code).then(
    token => {
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token)).then(
        () => LOG('Token stored to', TOKEN_PATH),
        err => {
          ERROR(`Couldn't write token to disk:`, err.stack);
          throw err;
        }
      );
    },
    err => {
      ERROR('Error while trying to retrieve access token:', err.stack);
      throw err;
    }
  );
}

export default async function authenticate() {
  // Load client secrets from a local file.
  const auth = await fs.readFile(CREDENTIALS_PATH).then(
    content => authorize(JSON.parse(content)),
    err => {
      ERROR('Error loading client secret file:', err.stack);
      throw err;
    }
  );
  // Set the authentication globally for all google services.
  google.options({ auth });
  return auth;
}
