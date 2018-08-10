'use strict';

const {google} = require('googleapis');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const {mkdir} = require('./utils');
const OAuth2Client = google.auth.OAuth2;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Converts an index into the A1 notation for columns
 */
function indexToA1Column(columnIndex) {
    let dividend = columnIndex;
    let columnName = '';

    while (dividend > 0) {
        const modulo = (dividend - 1) % 26;
        columnName = String.fromCharCode(65 + modulo) + columnName;
        dividend = Math.floor((dividend - modulo) / 26);
    }

    return columnName;
}

/**
 * Generates a A1 index for numeric coordinates
 */
function gridCoordsToA1(column, row) {
    return `${indexToA1Column(column)}${row}`;
}

/**
 * Wrapper around Google's bullshit authentication process. The promise will
 * resolve with a OAuth2Client object.
 *
 * @return Promise<OAuth2Client>
 */
function authorize(credentials) {
    const tokenPath = path.join(
        process.env.HOME,
        '.config/vlang/google_token.json'
    );

    mkdir(path.dirname(tokenPath));

    return new Promise((resolve, reject) => {
        tryAuthorize(credentials, (out) => {
            if (out instanceof OAuth2Client) {
                resolve(out);
            } else {
                reject(out);
            }
        }, tokenPath);
    });
}

/**
 * Tries to re-use the authorization token from `tokenPath` and if it fails
 * creates a new one.
 */
function tryAuthorize(credentials, callback, tokenPath) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client =
        new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    fs.readFile(tokenPath, 'utf-8', (err, token) => {
        if (err) {
            return getNewToken(oAuth2Client, callback, tokenPath);
        }

        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Flaky process to get the token from Google's website
 */
function getNewToken(oAuth2Client, callback, tokenPath) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('Authorize this app by visiting this url:', authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) {
                return callback(err);
            }

            oAuth2Client.setCredentials(token);

            fs.writeFile(tokenPath, JSON.stringify(token), (err) => {
                if (err) {
                    console.error(err);
                    return callback(err);
                }

                console.log('Token stored to', tokenPath);

                callback(oAuth2Client);
            });
        });
    });
}

/**
 * Ensures that the list of sheets are present and have the expected columns.
 */
function ensureSheets(a2c, spreadsheetId, sheetNames) {
    return new Promise((resolve, reject) => {
        const gSheets = google.sheets({version: 'v4', auth: a2c});

        /**
         * Converts a sheet name into a `addSheet` update.
         */
        function nameToUpdate(name) {
            return {
                'addSheet': {
                    'properties': {
                        'title': name,
                        'gridProperties': {
                            'rowCount': 1,
                            'columnCount': 5,
                        },
                    },
                },
            };
        }

        /**
         * Lists all existing sheets and creates the request to create the
         * missing sheets.
         */
        function listSheets() {
            gSheets.spreadsheets.get({
                spreadsheetId,
            }, (err, output) => {
                if (err) {
                    console.error(err);
                    return reject();
                }

                const {data} = output;
                const {sheets} = data;
                const namesSet = {};

                for (const sheet of sheets) {
                    namesSet[sheet.properties.title] = true;
                }

                const toCreate = [];

                for (const name of sheetNames) {
                    if (!namesSet[name]) {
                        toCreate.push(nameToUpdate(name));
                    }
                }

                createSheets(toCreate);
            });
        }

        /**
         * Does the sheet creation.
         */
        function createSheets(requests) {
            if (!requests.length) {
                return listSheetsAgain();
            }

            gSheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests,
                },
            }, (err, output) => {
                if (err) {
                    console.error(err);
                    return reject();
                }

                listSheetsAgain();
            });
        }

        /**
         * Now that all the sheets exist, list them to get a mapping between
         * names and IDs.
         */
        function listSheetsAgain() {
            gSheets.spreadsheets.get({
                spreadsheetId,
            }, (err, output) => {
                if (err) {
                    console.error(err);
                    return reject();
                }

                const {data} = output;
                const {sheets} = data;
                const sheetIds = {};

                for (const sheet of sheets) {
                    sheetIds[sheet.properties.title] =
                        sheet.properties.sheetId;
                }

                fillHeaders(sheetIds);
            });
        }

        /**
         * For all sheets, ensure that headers are in place
         */
        function fillHeaders(sheetIds) {
            /**
             * Creates a header update request for a given sheet name.
             */
            function nameToHeaders(name) {
                return {
                    'updateCells': {
                        rows: {
                            values: [
                                {
                                    userEnteredValue: {
                                        stringValue: 'Component',
                                    },
                                    textFormatRuns: [
                                        {
                                            startIndex: 0,
                                            format: {
                                                bold: true,
                                            },
                                        },
                                    ],
                                },
                                {
                                    userEnteredValue: {
                                        stringValue: 'Key',
                                    },
                                    textFormatRuns: [
                                        {
                                            startIndex: 0,
                                            format: {
                                                bold: true,
                                            },
                                        },
                                    ],
                                },
                                {
                                    userEnteredValue: {
                                        stringValue: 'Range',
                                    },
                                    textFormatRuns: [
                                        {
                                            startIndex: 0,
                                            format: {
                                                bold: true,
                                            },
                                        },
                                    ],
                                },
                                {
                                    userEnteredValue: {
                                        stringValue: 'Original',
                                    },
                                    textFormatRuns: [
                                        {
                                            startIndex: 0,
                                            format: {
                                                bold: true,
                                            },
                                        },
                                    ],
                                },
                                {
                                    userEnteredValue: {
                                        stringValue: 'Translation',
                                    },
                                    textFormatRuns: [
                                        {
                                            startIndex: 0,
                                            format: {
                                                bold: true,
                                            },
                                        },
                                    ],
                                },
                            ]
                        },
                        fields: '*',
                        start: {
                            sheetId: sheetIds[name],
                            rowIndex: 0,
                            columnIndex: 0,
                        }
                    }
                }
            }

            const requests = sheetNames.map(nameToHeaders);

            gSheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests,
                },
            }, (err) => {
                if (err) {
                    console.error(err);
                    return reject();
                }

                done();
            });
        }

        function done() {
            resolve();
        }

        listSheets();
    });
}

/**
 * Insert missing data lines into a sheet
 */
function patchSheet(gSheets, spreadsheetId, sheetMap, sheetName, sheetData) {
    /**
     * Converts a string into a formatted cell
     */
    function stringToCell(str, wrap = false) {
        return {
            userEnteredValue: {
                stringValue: str,
            },
            userEnteredFormat: {
                backgroundColor: {
                    red: 1,
                    green: 1,
                    blue: 1,
                    alpha: 1,
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'TOP',
                wrapStrategy: wrap ? 'WRAP' : 'CLIP',
            },
            textFormatRuns: str.length ? [
                {
                    startIndex: 0,
                    format: {
                        bold: false,
                        italic: false,
                        strikethrough: false,
                        underline: false,
                        foregroundColor: {
                            red: 0,
                            green: 0,
                            blue: 0,
                            alpha: 1,
                        },
                    },
                },
            ] : [],
        };
    }

    /**
     * Converts a row into a formatted row
     */
    function rowToValues(row) {
        return [
            stringToCell(row[0]),
            stringToCell(row[1]),
            stringToCell(row[2]),
            stringToCell(row[3], true),
            stringToCell(row[4], true),
        ];
    }

    const sheetInfo = sheetMap[sheetName];

    return new Promise((resolve, reject) => {
        const presentKeys = {};

        /**
         * Lists currently present keys in order to know what to push
         */
        function getPresentKeys() {
            if (sheetInfo.gridProperties.rowCount < 2) {
                return insertMissingKeys();
            }

            gSheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A2:B`,
            }, (err, resp) => {
                if (err) {
                    console.error(err);
                    return reject(err);
                }

                const {data} = resp;

                for (const row of data.values) {
                    const key = JSON.stringify(row);
                    presentKeys[key] = true;
                }

                insertMissingKeys();
            });
        }

        /**
         * Appends missing keys into the document
         */
        function insertMissingKeys() {
            const rows = [];

            for (const row of sheetData) {
                const key = JSON.stringify([row[0], row[1]]);

                if (!presentKeys[key]) {
                    rows.push({
                        values: rowToValues(row),
                    });
                }
            }

            if (!rows.length) {
                return resolve();
            }

            const request = {
                spreadsheetId,
                resource: {
                    requests: [
                        {
                            appendCells: {
                                sheetId: sheetInfo.sheetId,
                                fields: '*',
                                rows,
                            },
                        },
                    ],
                },
            };

            gSheets.spreadsheets.batchUpdate(request, (err) => {
                if (err) {
                    console.error(err);
                    return reject();
                }

                resolve();
            });
        }

        getPresentKeys();
    });
}

/**
 * Inserts all the missing data into the spreadsheet
 */
function insertMissingData(a2c, spreadsheetId, data) {
    return new Promise((resolve, reject) => {
        const sheetMap = {};
        const gSheets = google.sheets({version: 'v4', auth: a2c});

        /**
         * Map all sheets info to their title
         */
        function mapSheets() {
            gSheets.spreadsheets.get({
                spreadsheetId,
            }, (err, output) => {
                if (err) {
                    console.error(err);
                    return reject();
                }

                const {data} = output;
                const {sheets} = data;

                for (const sheet of sheets) {
                    sheetMap[sheet.properties.title] = sheet.properties;
                }

                handleAllSheets();
            });
        }

        /**
         * Run the the patching function on all sheets at the time
         */
        function handleAllSheets() {
            const tasks = [];

            for (const sheetName of Object.keys(data)) {
                tasks.push(patchSheet(
                    gSheets,
                    spreadsheetId,
                    sheetMap,
                    sheetName,
                    data[sheetName]
                ));
            }

            Promise.all(tasks).then(
                () => resolve(),
                () => reject()
            );
        }

        mapSheets();
    });
}

/**
 * Dump all sheets in the spreadsheet into the following format:
 *
 * {
 *   SHEET_NAME: [
 *     {
 *       HEADER1: value1,
 *       HEADER2: value2,
 *       ...
 *     }
 *   ],
 *   ...
 * }
 */
function dumpData(a2c, spreadsheetId) {
    const gSheets = google.sheets({version: 'v4', auth: a2c});

    return new Promise((resolve, reject) => {
        const sheetInfo = [];

        /**
         * List the sheets and gather info about them (like their sizes)
         */
        function listSheets() {
            gSheets.spreadsheets.get({
                spreadsheetId,
            }, (err, output) => {
                if (err) {
                    console.error(err);
                    return reject();
                }

                const {data} = output;
                const {sheets} = data;

                for (const sheet of sheets) {
                    sheetInfo.push(sheet.properties);
                }

                importAllData();
            });
        }

        /**
         * Gets the data for one given sheet
         */
        function importSheetData(info, out) {
            const gp = info.gridProperties;
            const last = gridCoordsToA1(gp.columnCount, gp.rowCount);

            return new Promise((resolve, reject) => {
                gSheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `${info.title}!A1:${last}`,
                }, (err, resp) => {
                    if (err) {
                        console.error(err);
                        return reject();
                    }

                    const {values} = resp.data;
                    const head = values[0];

                    const rows = [];

                    for (let i = 1; i < values.length; i += 1) {
                        const row = values[i];
                        const obj = {};

                        for (let j = 0; j < head.length; j += 1) {
                            obj[head[j]] = row[j];
                        }

                        rows.push(obj);
                    }

                    out[info.title] = rows;

                    resolve();
                });
            });
        }

        /**
         * Imports all sheets at once
         */
        function importAllData() {
            const tasks = [];
            const out = {};

            for (const info of sheetInfo) {
                tasks.push(importSheetData(info, out));
            }

            Promise.all(tasks).then(
                () => resolve(out),
                () => reject
            );
        }

        listSheets();
    });
}

module.exports = {
    authorize,
    ensureSheets,
    insertMissingData,
    dumpData,
};
