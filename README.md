Setup
===

This app won't work without a properly configured `config/` folder. The `config/` folder is not included in this repository because it contains sensitive information (API keys).

The following files are needed in the `config/` folder:
## `credentials.json` (sample below)
```JSON
{
  "installed": {
    "client_id": "01234567-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345.apps.googleusercontent.com",
    "project_id": "solar-monitoring-project",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "ABCDEFGHIJKLMN0123456789",
    "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"]
  }
}
```
  - Login to [console.developers.google.com](https://console.developers.google.com) (not with a utexas email).
  - Create a project.
  - Go to `APIs & Services` > `Library`. Search for `Google Drive API` and `Google Sheets API`. Hit the enable button for each of these.
  - Go to `APIs & Services` > `Credentials`. Click `Create credentials` > `OAuth client ID`.
    - Answer for `Application type` the choice `Other`.
    - Answer for `Name` whatever you'd like.
    - Replace the `client_id` and `client_secret` in the sample above with the client ID and client secret you receive. This is your `credentials.json` file. 
    - Alternatively, click the download button from the website and rename the file as `credentials.json`.

## `derived.config.json` (sample below)
```JSON
{
  "fields": [
    "Timestamp",
    "Local Time",
    "MPPT Power (W)",
    "MPPT Energy Accumulated (Wh)",
    "Load-Only Power (W)",
    "Load-Only Energy Accumulated (Wh)",
    "Total Irradiance (W/m^2)",
    "Theoretical Power (W)",
    "Theoretical Energy Accumulated (Wh)"
  ],
  "panelArea": 1.56,
  "panelTilt": 28.5,
  "panelAzimuth": 185.7
}
```
  - This sample should not require changes. The `fields` array only serves as another form of documentation for the column names that appear in the uploaded Google Sheet files. Renaming these columns requires editing the associated code in `main.js` in the `updateDerived` function for the column names to actually change in the uploaded files.

## `pusher.config.json` (sample below)
```JSON
{
  "key": "ABCDEFGHIJKLMNOPQRST",
  "options": {
    "cluster": "us2",
    "forceTLS": true
  },
  "channelIDs": ["ch0", "ch1", "ch2", "ch3", "ch4"],
  "channelNames": [
    "MPPT Voltage (V)",
    "MPPT Current (A)",
    "Load-Only Voltage (V)",
    "Load-Only Current (A)",
    "Open-Circuit Voltage (V)"
  ],
  "eventName": "new-data"
}
```
  - Create a free Pusher account and replace `key` with your API key.
  - During the signup process match the `cluster` to `us2` as given here.
  - Don't change `channelIDs` or `eventName`. These are set by the data acquisition (Python) code.
    - Note: Changing the settings in the data acquisition code would also require changing the front end website code.
  - `channelNames` are the column names that appear on Google Drive. Rename here as desired. (No need to dig into `main.js` as was needed for `derived.config.json`.)
  
## `solcast.config.json` (sample below)
```JSON
{
  "url": "https://api.solcast.com.au/weather_sites/e980-0e4d-38b6-ec2b/forecasts?format=json&api_key=ABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
  "fields": [
    "ghi",
    "ghi90",
    "ghi10",
    "ebh",
    "dni",
    "dni10",
    "dni90",
    "dhi",
    "air_temp",
    "zenith",
    "azimuth",
    "cloud_opacity",
    "period_end",
    "period"
  ]
}
```
  - Email me for the Solcast API key. They are a paid service, but they graciously provided us with free real-time solar irradiance data for educational purposes. (Contact: spenceryue AT utexas dot edu.)
    - In the `url` replace the end of the string (after `&api_key=`) with the Solcast API key.
  - The `fields` are the same as the fields returned by the Solcast API. Do not modify these.

On the first run of the app, you will be asked to sign in with a Google account in order to access the Google Drive where you wish to store uploaded solar panel measurement and Solcast solar irradiance data.

To change the Google Drive where data is uploaded, delete `token.json` within the `config/` folder. (This file is created automatically after the first launch.)

Additionally, `drive.json` and `today.json` are files created automatically by the app. These files contain the backup "application state", which just contains the resource IDs used to reference the Google Drive folders and files where data will be uploaded to today. (The file IDs [`today.json`] change daily. The folder IDs [`drive.json`] remain fixed.)

Run
===

To run the app, you must have Node (v10.15.3) and Git (v2.21.0) installed. A `RUN_ME.cmd` script is included in the `scripts/` folder which will start the app on Windows. You can double click this file to run it. (A `RUN_ME.sh` script is also included to run on Linux/Mac.)

Portable binaries of Node and Git for Windows (x64) are included for you in the `scripts/` folder. They are used by the `RUN_ME.cmd` script.

Errors and info messages are logged to the `logs/` directory with the time and date at which the program was launched as the file name. Check these log files to help in diagnosing any problems that arise with data not uploading to Google Drive.

Here is a screenshot of what a Google Drive properly setup by the app should look like:

![Screenshot of Drive][screenshot]

Inside each of the folders (Derived Values, Measurements, Solcast Data) are Google Sheet files with file names set as the date on which they were collected and uploaded. A README file is also generated in the folder with additional detailed information about how the data is organized in each of these folders. 

To download a file or the entire folder, right click the thumbnail on the Google Drive website and select `Download`. Google Sheet files are converted to an Excel files (.xlsx). Alternatively, you can download a file in a different format (e.g. CSV) by opening the file in Google Sheets and selecting `File` > `Download As`.

When the app launches through `RUN_ME.cmd`, it first checks GitHub for newer code (via `git pull`). To run the app without checking GitHub and without logging outputs to a file, do `node src\index.js` from the command prompt (or `node path\to\src\index.js`).

Limitations
===
This app currently only supports uploading to a single user's Google Drive. One workaround for uploading to multiple users' Google Drives is to simply clone the repository for each user and follow the first-launch sign-in procedure to link the repository to a given user. Afterwards, launch separate instances of the app, one for each user. (The same `config/` files can be used. Only the auto-generated `token.json` files must be different.)

If this strategy is taken, you must beware of the quota limits on the Pusher API. Only 200,000 messages can be sent a day. The data acquisition system currently uploads samples at about 1 Hz for roughly 12 hours a day. This amounts to ~43,200 messages sent and an additional `(N + 1) * 43,200` messages received, where `N` is the number of instances of this app. (The `+1` is to account for the Pusher connection held by the front end website which also receives Pusher data.) Thus, only `N=2` users can be supported without exceeding the quota (requiring 172,800 messages per day total).

For more information on how the Pusher API quota is calculated, [see here](https://support.pusher.com/hc/en-us/articles/360019418713-How-is-my-message-count-calculated-in-Channels-).


[screenshot]: Screenshot%20of%20Drive.png "Screenshot of Drive"
