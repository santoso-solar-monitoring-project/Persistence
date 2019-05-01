How to reproduce this repo
===

Note this repo won't work without a properly configured "config/" folder. But this has a lot of API keys, so it can't be uploaded here to GitHub.

Needed files:
- credentials.json
  - {installed:{client_id, project_id, auth_uri, token_uri, auth_provider_x509_cert_url, client_secret, redirect_uris:[]}}
  - From console.developers.google.com (OAuth2 project credentials)
- derived.config.json
  - {fields:[], panelArea, panelTilt, panelAzimuth}
- pusher.config.json
  - {key,options:{cluster,forceTLS},channelIDs:[],channelNames:[],eventName}
- solcast.config.json
  - {url, fields:[]}

Then you need to authenticate on first run with a google account for the google drive you will store everything inside. The folder structure must match that of https://drive.google.com/drive/u/1/folders/1fIbkh2C2daDOJPk-vvpWKOTbHOwvjiS2 exactly, and folder IDs should be updated inside main.js.