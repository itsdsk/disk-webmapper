const electron = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindowA = null;
let mainWindowB = null;

const {
  app,
  BrowserWindow
} = electron;

// app.disableHardwareAcceleration();
/*
 we initialize our application display as a callback of the electronJS "ready" event
 */
app.on('ready', () => {
  // get screen resolution
  const {
    width,
    height
  } = electron.screen.getPrimaryDisplay().workAreaSize
  console.log(`Detected screen size: ${JSON.stringify({ width, height })}`);
  // window options (electronJS)
  const windowOpts = {
    width: (width / 2),
    height: height,
    // useContentSize: true,
    // fullscreen: true,
    // enableLargerThanScreen: true,
    show: false,
    autoHideMenuBar: true,
    // center: true,
    // useContentSize: true,
    frame: true, // frameless window without chrome graphical interfaces (borders, toolbars etc)
    kiosk: false, // chromium kiosk mode (fullscreen without icons or taskbar)
    backgroundColor: '#000000', // set backgrounnd
    webPreferences: {
      sandbox: false,
      nodeIntegration: false,
      overlayScrollbars: false,
    },
  };
  // create 2 windows
  mainWindowA = new BrowserWindow(windowOpts);
  mainWindowB = new BrowserWindow(windowOpts);
  // move windows next to each other
  mainWindowA.setPosition(0, 0);
  mainWindowB.setPosition((width / 2), 0);
  // log
  console.log(`Window positions: ${JSON.stringify(mainWindowA.getPosition())}, ${JSON.stringify(mainWindowB.getPosition())}`);
  console.log(`Window sizes: ${JSON.stringify(mainWindowA.getContentSize())}, ${JSON.stringify(mainWindowB.getContentSize())}`);
  // behaviour on pageload
  mainWindowA.webContents.on('did-finish-load', async () => {
    setTimeout(() => {
      // show newly opened window
      if (mainWindowA.isMinimized()) {
        mainWindowA.restore();
      }
      mainWindowA.show();
      // save page to disk
      if (savePage == true) {
        var saveLocation = '/tmp/index.html'; // TODO: add media path
        console.log(`saving page ${saveLocation} (${mainWindowA.webContents.getURL()})`);
        mainWindowA.webContents.savePage(saveLocation, 'HTMLComplete').then(() => {
          console.log(`saved page successfully`);
        }).catch(err => {
          console.log(`didnt save page successfully: ${err}`);
        });
        savePage = false;
      }
      // hide previous window
      //mainWindowB.hide();
      //mainWindowB.minimize();
      // report loaded to client
      if (client) client.write(JSON.stringify({
        loaded: true,
        whichWindow: 'A',
        URL: mainWindowA.webContents.getURL()
      }));
    }, 300);
  });
  mainWindowB.webContents.on('did-finish-load', async () => {
    setTimeout(() => {
      // show newly opened window
      if (mainWindowB.isMinimized()) {
        mainWindowB.restore();
      }
      mainWindowB.show();
      // save page to disk
      if (savePage == true) {
        var saveLocation = '/tmp/index.html'; // TODO: add media path
        console.log(`saving page ${saveLocation} (${mainWindowB.webContents.getURL()})`);
        mainWindowB.webContents.savePage(saveLocation, 'HTMLComplete').then(() => {
          console.log(`saved page successfully`);
        }).catch(err => {
          console.log(`didnt save page successfully: ${err}`);
        });
        savePage = false;
      }
      // hide previous window
      //mainWindowA.hide();
      //mainWindowA.minimize();
      // report loaded to client
      if (client) client.write(JSON.stringify({
        loaded: true,
        whichWindow: 'B',
        URL: mainWindowB.webContents.getURL()
      }));
    }, 300);
  });

  // log windows
  mainWindowA.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Console message (window A): ${message}`);
  });
  mainWindowB.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Console message (window B): ${message}`);
  });

  //
  process.on('uncaughtException', (err) => {
    console.log(err);
  });

  // initial page load
  var initialURL = `index.html`;
  mainWindowA.loadFile(initialURL);

  // bool state to say which window to load to
  var flipWindow = false;

  // bool state to say whether to save page
  var savePage = false;

  // create UNIX socket to receive URLs on
  var client; // keep track of connected client
  const SOCKETFILE = "/tmp/renderer.sock";
  // check for failed cleanup
  require('fs').stat(SOCKETFILE, function (err, stats) {
    if (err) {
      // no leftover socket found... start server
      createServer(SOCKETFILE);
      return;
    }
    // remove leftover socket file then start server
    require('fs').unlink(SOCKETFILE, function (err) {
      if (err) {
        console.log("ERROR REMOVING LEFTOVER SOCKET FILE");
      }
      createServer(SOCKETFILE);
      return;
    });
  });

  function createServer(socket) {
    console.log('Creating server.');
    var server = net.createServer(function (stream) {
        console.log('Connection acknowledged.');

        stream.on('end', function () {
          console.log('Client disconnected.');
        });

        stream.on('data', function (msg) {
          // parse buffer
          msg = JSON.parse(msg.toString());

          console.log('Client:', JSON.stringify(msg));

          // save client
          client = stream;

          // check type of message received
          if (msg.command == "loadURL") {
            // check save request
            savePage = (msg.save ? true : false);
            // display recieved URI
            if (flipWindow) {
              mainWindowA.loadURL(msg.path);
            } else {
              mainWindowB.loadURL(msg.path);
            }
            // flip window to display on
            flipWindow = !flipWindow;
          } else if (msg.command == "saveURL") {
            // get right browser window
            var _browserWindow = false;
            if (mainWindowA.webContents.getURL() == msg.URL) {
              _browserWindow = mainWindowA;
            } else if (mainWindowB.webContents.getURL() == msg.URL) {
              _browserWindow = mainWindowB;
            } else {
              console.log(`error saving url for ${msg.URL} (not matching ${mainWindowA.webContents.getURL()} or ${mainWindowB.webContents.getURL()})`);
            }
            // if requested URL is open
            if (_browserWindow) {
              // make directory
              var randomName = "item_" + Math.random().toString(36).substring(2, 8);
              var newDirectory = path.join(msg.mediaDir, randomName);
              fs.mkdir(newDirectory, function (err) {
                if (err) console.log(`err: ${err}`)
                else {
                  // save page
                  _browserWindow.webContents.savePage(path.join(newDirectory, 'index.html'), 'HTMLComplete').then(() => {
                    //console.log(`saved page successfully`);
                    // save screenshot
                    _browserWindow.capturePage((image) => {
                      fs.writeFile(path.join(newDirectory, 'thumb.jpg'), image.toJPEG(80), (err) => {
                        if (err) console.log(`error capturing page: ${err}`)
                        //console.log(`saved screenshot`);
                        // get datetime
                        var timestamp = new Date().toISOString();
                        timestamp = timestamp.substring(0, timestamp.lastIndexOf('.')); // trim ms out of datetime string
                        // build metadata object
                        var newMetadata = {
                          "demo": {
                            "title": _browserWindow.webContents.getTitle(),
                            "description": msg.URL,
                            "files": ["index.html"],
                            "channels": ["firstchannel"],
                            "playcount": 0,
                            "image": "thumb.jpg",
                            "modified": timestamp
                          }
                        }
                        // save metadata
                        fs.writeFile(path.join(newDirectory, 'demo.json'), JSON.stringify(newMetadata, null, 4), function (err) {
                          if (err) console.log(`error saving metadata: ${err}`);
                          console.log(`saved page ${msg.URL} to ${newDirectory}`);
                          // report loaded to client
                          if (client) client.write(JSON.stringify({
                            saved: true,
                            directory: randomName
                          }));
                        });
                      });
                    })
                  }).catch(err => {
                    console.log(`didnt save page successfully: ${err}`);
                  });
                }
              })
            }
          }
        });
      })
      .listen(socket)
      .on('connection', function (socket) {
        console.log('Client connected.');
      });
    return server;
  }
});