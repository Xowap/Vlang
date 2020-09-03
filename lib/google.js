const { google } = require("googleapis");
const path = require("path");
const readline = require("readline");
const fs = require("fs");
const { VlangError } = require("./exceptions");
const { mkdir } = require("./utils");
const OAuth2Client = google.auth.OAuth2;

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Converts an index into the A1 notation for columns
 */
function indexToA1Column(columnIndex) {
    let dividend = columnIndex;
    let columnName = "";

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
 * Wrapper function that will unroll Google's shitty authentication mechanism
 * and guide the user into it. The output of this function is all the
 * credentials you need to operate on Google Sheets.
 *
 * @return {Promise<OAuth2Client>}
 */
async function getA2c() {
    const gcc = process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT;

    if (!gcc) {
        throw new VlangError(
            "You must put your Google credentials in the " +
                '"GOOGLE_APPLICATION_CREDENTIALS_CONTENT" environment ' +
                'variable. That is, the content of the "credentials.json" ' +
                "file that you will get from the Step 1 of this tutorial: " +
                "https://developers.google.com/sheets/api/quickstart/nodejs."
        );
    }

    const credentials = JSON.parse(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT
    );

    return await authorize(credentials);
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
        ".config/vlang/google_token.json"
    );

    mkdir(path.dirname(tokenPath));

    return new Promise((resolve, reject) => {
        tryAuthorize(
            credentials,
            (out) => {
                if (out instanceof OAuth2Client) {
                    resolve(out);
                } else {
                    reject(out);
                }
            },
            tokenPath
        );
    });
}

/**
 * Tries to re-use the authorization token from `tokenPath` and if it fails
 * creates a new one.
 */
function tryAuthorize(credentials, callback, tokenPath) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new OAuth2Client(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    fs.readFile(tokenPath, "utf-8", (err, token) => {
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
        access_type: "offline",
        scope: SCOPES,
    });

    console.log("Authorize this app by visiting this url:", authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question("Enter the code from that page here: ", (code) => {
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

                console.log("Token stored to", tokenPath);

                callback(oAuth2Client);
            });
        });
    });
}

/**
 * A wrapper around Google's API to make it less shitty (by example by making
 * it return promises but also with shortcuts to build queries).
 */
class LessShittyGoogleApi {
    /**
     * Constructor
     *
     * @param a2c Authentication object  (see getA2c())
     * @param spreadsheetId ID of the spreadsheet you want to work on
     */
    constructor(a2c, spreadsheetId) {
        this.a2c = a2c;
        this.spreadsheetId = spreadsheetId;
        this.gSheets = google.sheets({ version: "v4", auth: this.a2c });
    }

    /**
     * Wrapper around `google.sheets.spreadsheets.get`. Uses the spreadsheet
     * ID provided to the constructor.
     */
    spreadsheetsGet() {
        return new Promise((resolve, reject) => {
            this.gSheets.spreadsheets.get(
                { spreadsheetId: this.spreadsheetId },
                (err, output) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve(output.data);
                }
            );
        });
    }

    /**
     * Wrapper around `google.sheets.spreadsheets.batchUpdate`
     *
     * @param requests All requests to be batched
     */
    spreadsheetsBatchUpdate(requests) {
        return new Promise((resolve, reject) => {
            this.gSheets.spreadsheets.batchUpdate(
                {
                    spreadsheetId: this.spreadsheetId,
                    resource: { requests },
                },
                (err) => {
                    if (err) {
                        reject(err);
                    }

                    resolve();
                }
            );
        });
    }

    /**
     * Transforms a spreadsheet into a dictionary.
     *
     * If the sheet doesn't match the expected head, empty content is returned.
     *
     * @param title {String} Title of the sheet
     * @param last {String} Coordinates of the bottom-right corner you want
     * @param expectedHead {Array[String]} Expected column names to be found
     */
    spreadsheetsValuesGet(title, last, expectedHead) {
        return new Promise((resolve, reject) => {
            this.gSheets.spreadsheets.values.get(
                {
                    spreadsheetId: this.spreadsheetId,
                    range: `${title}!A1:${last}`,
                },
                (err, resp) => {
                    if (err) {
                        return reject(err);
                    }

                    const values = resp.data.values || [];
                    const head = values[0];
                    const rows = [];

                    const headSet = new Set(head);
                    const headIntersect = new Set(
                        [...expectedHead].filter((x) => headSet.has(x))
                    );

                    if (headIntersect.size !== [...expectedHead].length) {
                        return resolve([]);
                    }

                    for (let i = 1; i < values.length; i += 1) {
                        const row = values[i];
                        const obj = {};

                        for (let j = 0; j < head.length; j += 1) {
                            obj[head[j]] = row[j];
                        }

                        rows.push(obj);
                    }

                    resolve(rows);
                }
            );
        });
    }
}

/**
 * Generates the update request to create the "header" line of a sheet
 */
function makeHeaderUpdate(sheetId) {
    return {
        updateCells: {
            rows: {
                values: [
                    {
                        userEnteredValue: {
                            stringValue: "Component",
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
                            stringValue: "Key",
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
                            stringValue: "Range",
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
                            stringValue: "Original",
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
                            stringValue: "Translation",
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
                ],
            },
            fields: "*",
            start: {
                sheetId,
                rowIndex: 0,
                columnIndex: 0,
            },
        },
    };
}

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
            horizontalAlignment: "LEFT",
            verticalAlignment: "TOP",
            wrapStrategy: wrap ? "WRAP" : "CLIP",
        },
        textFormatRuns: str.length
            ? [
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
              ]
            : [],
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

/**
 * Adapter class that will do all the operations required upstairs by the
 * extract/import utilities.
 */
class GoogleSource {
    /**
     * Constructor
     *
     * @param a2c Authentication object  (see getA2c())
     * @param spreadsheetId ID of the spreadsheet you want to work on
     */
    constructor(a2c, spreadsheetId) {
        this.google = new LessShittyGoogleApi(a2c, spreadsheetId);
    }

    /**
     * Transforms the whole document into a global dictionary
     */
    async makeDict() {
        const { sheets } = await this.google.spreadsheetsGet();
        const rawDict = {};

        for (const sheet of sheets) {
            const gp = sheet.properties.gridProperties;
            const last = gridCoordsToA1(gp.columnCount, gp.rowCount);

            for (const row of await this.google.spreadsheetsValuesGet(
                sheet.properties.title,
                last,
                ["Component", "Key", "Range", "Original", "Translation"]
            )) {
                const key = JSON.stringify([
                    sheet.properties.title,
                    row.Component,
                    row.Key,
                ]);

                if (!rawDict[key]) {
                    rawDict[key] = [];
                }

                rawDict[key].push(row);
            }
        }

        const dict = {};

        for (const [key, rows] of Object.entries(rawDict)) {
            if (rows.length === 1) {
                dict[key] = {
                    original: rows[0].Original,
                    translation: rows[0].Translation,
                };
            } else if (rows.length > 1) {
                const message = {};

                for (const { Range, Original, Translation } of rows) {
                    message[Range] = {
                        original: Original,
                        translation: Translation,
                    };
                }

                dict[key] = message;
            }
        }

        return dict;
    }

    /**
     * Maps sheets names to their IDs
     */
    async mapSheetsIds() {
        return (await this.google.spreadsheetsGet()).sheets.reduce(
            (out, sheet) => {
                out[sheet.properties.title] = sheet.properties.sheetId;
                return out;
            },
            {}
        );
    }

    /**
     * Ensures that a sheet is present for each language that we support. If
     * the sheet is not found it is created and the header line is written.
     *
     * @param languages {Iterable[String]} Languages to support
     */
    async ensureSheets(languages) {
        const { sheets } = await this.google.spreadsheetsGet();
        const namesSet = new Set(sheets.map((x) => x.properties.title));

        const requests = [...languages]
            .filter((x) => !namesSet.has(x))
            .map((name) => ({
                addSheet: {
                    properties: {
                        title: name,
                        gridProperties: {
                            rowCount: 1,
                            columnCount: 5,
                        },
                    },
                },
            }));

        if (requests.length) {
            await this.google.spreadsheetsBatchUpdate(requests);
        }

        const ids = await this.mapSheetsIds();
        const headerRequests = [...languages]
            .filter((x) => !namesSet.has(x))
            .map((name) => makeHeaderUpdate(ids[name]));

        if (headerRequests.length) {
            await this.google.spreadsheetsBatchUpdate(headerRequests);
        }
    }

    /**
     * Inserts all the new lines from the diff dict provided
     *
     * @param dict {Object} Output of newLinesToSync()
     */
    async insertNewLines(dict) {
        const languages = new Set(
            Object.keys(dict).map((k) => JSON.parse(k)[0])
        );
        await this.ensureSheets(languages);

        const rows = {};

        for (const [globalKey, message] of Object.entries(dict)) {
            const [lang, component, key] = JSON.parse(globalKey);

            if (!rows[lang]) {
                rows[lang] = [];
            }

            if (typeof message.original === "string") {
                rows[lang].push(
                    rowToValues([component, key, "", message.original, ""])
                );
            } else {
                for (const [range, text] of Object.entries(message)) {
                    rows[lang].push(
                        rowToValues([component, key, range, text.original, ""])
                    );
                }
            }
        }

        const ids = await this.mapSheetsIds();
        const requests = [];

        for (const [lang, langRows] of Object.entries(rows)) {
            if (!langRows.length) {
                continue;
            }

            requests.push({
                appendCells: {
                    sheetId: ids[lang],
                    fields: "*",
                    rows: langRows.map((r) => ({ values: r })),
                },
            });
        }

        if (requests.length) {
            await this.google.spreadsheetsBatchUpdate(requests);
        }
    }
}

module.exports = {
    GoogleSource,
    getA2c,
};
